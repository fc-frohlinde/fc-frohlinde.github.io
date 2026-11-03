// Flutlicht · Alte Anmeldung entfernen — once, by hand (03.11.2026).
// Since 1.2.71 trainers sign in with their account only; the rules of
// 31.10.2026 closed fcf_data to members. The old login's hashes (password,
// PIN, passkey id) stayed in the data as the way back to 1.2.70. That way is
// no longer needed: this job finds them and, with "loeschen", removes them.
// Looks at fcf_data (admin record, trainers, trash, everything) and at the
// in-database backups (__backups). Prints counts only — the logs of this
// repository are public; no value, name or code is ever printed.
import admin from 'firebase-admin';

const DB_URL = 'https://fc-frohlinde-ea23f-default-rtdb.europe-west1.firebasedatabase.app';
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
const del = String(process.env.LOESCHEN || '') === 'true';
const KEYS = new Set(['passwordHash', 'passwordSalt', 'pinHash', 'pinSalt', 'passkeyId', 'passkeyCreatedAt', 'passwordSetByAdmin']);
const note = (t, m) => console.log('::notice title=' + t + '::' + m);
const fail = m => { console.log('::error title=Alte Anmeldung::' + m); process.exitCode = 1; };

if (!sa) { console.log('FIREBASE_SERVICE_ACCOUNT fehlt.'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)), databaseURL: DB_URL });
const db = admin.database();

// every path below root whose last key is one of KEYS; strings that contain
// a key (a backup stored as text) are counted, not changed
function walk(v, path, hits, text) {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'string' && v.length > 200 && /"(passwordHash|pinHash|passkeyId)"/.test(v)) text.push(path);
    return;
  }
  for (const k of Object.keys(v)) {
    const p = path + '/' + k;
    if (KEYS.has(k)) hits.push(p);
    else walk(v[k], p, hits, text);
  }
}
const area = p => p.startsWith('fcf_data/adminAuth/') ? 'Admin'
  : /^fcf_data\/trainers\//.test(p) ? 'Trainer'
  : p.startsWith('fcf_data/') ? 'sonst in fcf_data'
  : p.startsWith('__backups') ? 'Sicherungen in der Datenbank' : 'anderswo';
const count = arr => { const c = {}; arr.forEach(p => { const a = area(p); c[a] = (c[a] || 0) + 1; }); return Object.entries(c).map(([a, n]) => a + ': ' + n).join(', ') || '0'; };

try {
  const roots = ['fcf_data', '__backups'];
  const hits = [], text = [];
  for (const r of roots) walk((await db.ref(r).get()).val(), r, hits, text);
  note('Alte Anmeldung', 'Найдено полей старого входа: ' + hits.length + ' (' + count(hits) + ')' + (text.length ? '; копий-текстов с ними: ' + text.length + ' (' + count(text) + ', не трогаем)' : ''));
  if (!del) { note('Alte Anmeldung', 'Только проверка. Удаление — запуск с «loeschen».'); }
  else if (hits.length) {
    const up = {}; hits.forEach(p => { up[p] = null; });
    await db.ref().update(up);
    const again = [];
    for (const r of roots) walk((await db.ref(r).get()).val(), r, again, []);
    if (again.length) fail('После удаления осталось: ' + again.length + ' (' + count(again) + ')');
    else note('Alte Anmeldung', 'Удалено: ' + hits.length + ' (' + count(hits) + '). Проверка после: 0.');
  } else note('Alte Anmeldung', 'Удалять нечего.');
} catch (e) {
  fail('Ошибка: ' + (e && (e.message || e)));
} finally {
  await admin.app().delete();
}
