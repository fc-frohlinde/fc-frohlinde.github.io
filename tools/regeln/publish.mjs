// Flutlicht · Regeln veröffentlichen. Started by .github/workflows/regeln.yml
// (by hand, after the emulator tests passed): compares the rules in the real
// database with database.rules.json, keeps the old ones in fcf_safe/regeln
// (no client can read that) and — only with PUBLISH=1 — replaces them.
// Without PUBLISH it only shows what would change. Output as annotations.
import fs from 'node:fs';
import crypto from 'node:crypto';
import admin from 'firebase-admin';

const DB_URL = 'https://fc-frohlinde-ea23f-default-rtdb.europe-west1.firebasedatabase.app';
const note = (lvl, m) => console.log(`::${lvl} title=Правила::${m}`);
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { note('error', 'Нет секрета FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
const publish = process.env.PUBLISH === '1';

const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)), databaseURL: DB_URL });
const URL_ = DB_URL + '/.settings/rules.json';
let H = {};
const hash = t => crypto.createHash('sha256').update(t).digest('hex').slice(0, 8);
// The console may keep comments; for comparing, read past them
const parse = t => { try { return JSON.parse(t); } catch (e) { return JSON.parse(t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')); } };

let code = 0;
try {
  const { access_token: tok } = await app.options.credential.getAccessToken();
  H = { Authorization: 'Bearer ' + tok };
  const r0 = await fetch(URL_, { headers: H });
  if (!r0.ok) throw new Error('чтение текущих правил: HTTP ' + r0.status);
  const oldText = await r0.text();
  const newText = fs.readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8');
  const oldR = (parse(oldText).rules) || {}, newR = (parse(newText).rules) || {};
  const keys = [...new Set([...Object.keys(oldR), ...Object.keys(newR)])].sort();
  const added = keys.filter(k => !(k in oldR)), removed = keys.filter(k => !(k in newR));
  const changed = keys.filter(k => k in oldR && k in newR && JSON.stringify(oldR[k]) !== JSON.stringify(newR[k]));
  const what = [added.length && 'новые узлы: ' + added.join(', '), removed.length && 'убраны: ' + removed.join(', '),
    changed.length && 'изменены: ' + changed.join(', ')].filter(Boolean).join('; ') || 'отличий нет';
  note('notice', `Сейчас в базе ${hash(oldText)}, в репозитории ${hash(newText)}: ${what}`);
  if (!added.length && !removed.length && !changed.length) {
    note('notice', 'Публиковать нечего');
  } else if (!publish) {
    note('notice', 'Только просмотр: чтобы опубликовать, запустить с «Опубликовать» = да');
  } else {
    // the old rules first, so they can be put back
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
    await admin.database().ref('fcf_safe/regeln/' + stamp).set({ t: Date.now(), hash: hash(oldText), text: oldText });
    const r1 = await fetch(URL_, { method: 'PUT', headers: H, body: newText });
    if (!r1.ok) throw new Error('публикация: HTTP ' + r1.status + ' ' + (await r1.text()).slice(0, 300));
    const r2 = await fetch(URL_, { headers: H });
    const now = await r2.text();
    if (JSON.stringify(parse(now)) !== JSON.stringify(parse(newText))) throw new Error('после публикации в базе не то, что в репозитории');
    note('notice', `Опубликовано: ${hash(newText)} (старые правила сохранены в fcf_safe/regeln/${stamp})`);
  }
} catch (e) {
  note('error', String((e && e.message) || e).slice(0, 400));
  code = 1;
} finally {
  await app.delete();
}
process.exit(code);
