// Диагностика 08.11.2026 (только чтение, только числа — лог публичный).
// Что на сервере после перезаписи старой копией: журнал, копии, игра 08.11.
import admin from 'firebase-admin';
import { decode } from './lib.mjs';
const DB_URL = 'https://fc-frohlinde-ea23f-default-rtdb.europe-west1.firebasedatabase.app';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), databaseURL: DB_URL });
const get = async p => (await admin.database().ref(p).get()).val();
const T = ts => ts ? new Date(ts).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '–';
const DAY0 = Date.UTC(2026, 10, 7, 23, 0);   // So 08.11. 00:00 Berlin
const BLK = 'U19__2026/27';
const hist = list => { const h = {}; list.forEach(e => { const a = String(e.action || '?'); h[a] = (h[a] || 0) + 1; }); return JSON.stringify(h); };
const out = [];
const say = s => { out.push(s); console.log(s); };
function matchInfo(G, label) {
  const db = G && G.db || {};
  const blk = db[BLK]; if (!blk) { say(label + ': блока нет'); return; }
  const S = decode(blk.sessions) || [], P = (decode(blk.players) || []).filter(Boolean);
  const si = S.findIndex(s => s && s.type === 'match' && /(^|\D)0?8\.11/.test(String(s.date || '')));
  if (si < 0) { say(label + ': игры 08.11 нет'); return; }
  const s = S[si], c = {};
  P.forEach(p => { const st = Array.isArray(p.s) ? p.s[si] : undefined; c[st === undefined ? 'нет' : st] = (c[st === undefined ? 'нет' : st] || 0) + 1; });
  const perf = P.filter(p => Array.isArray(p.perf) && p.perf[si] != null && p.perf[si] !== 0).length;
  const goals = P.filter(p => Array.isArray(p.goals) && p.goals[si]).length;
  const ml = G.matchLineups && G.matchLineups[BLK + '__' + si];
  say(label + `: игра si=${si}; статусы ${JSON.stringify(c)}; Einsatz ${perf}; голы ${goals}; ` +
    `расстановка ${ml ? 'есть (вариантов ' + (ml.vars ? Object.keys(ml.vars).length : 0) + ')' : 'нет'}; ` +
    `Spielbericht ${s.rep ? 'есть (' + T(s.rep.t) + ', ключей ' + Object.keys(s.rep).length + ')' : 'нет'}; Matchplan ${s.mp ? 'есть' + (s.mp.img ? ' с картинкой' : '') : 'нет'}; ` +
    `Kader ${s.squad ? (s.squad.p || []).length + ' игр.' : 'нет'}`);
}
const raw = await get('fcf_data');
say('fcf_data: последнее сохранение ' + T(raw && raw._lastSaveTs) + ', версия данных ' + (raw && raw.version));
const G = decode(raw);
matchInfo(G, 'Сейчас');
for (const k of ['auditLogT', 'auditLogP']) {
  const v = Object.values((raw && raw[k]) || {}).filter(Boolean);
  const today = v.filter(e => (e.ts || 0) >= DAY0);
  say(`${k}: всего ${v.length}, последняя ${T(Math.max(0, ...v.map(e => e.ts || 0)))}; сегодня ${today.length} ${hist(today)}`);
}
const al = Array.isArray(G && G.auditLog) ? G.auditLog : [];
const alt = al.filter(e => e && (e.ts || 0) >= DAY0);
say(`auditLog (в данных): всего ${al.length}, последняя ${T(Math.max(0, ...al.map(e => (e && e.ts) || 0)))}; сегодня ${alt.length} ${hist(alt)}`);
// Копии в базе: сначала только ts/kind, данные — только у сегодняшних
for (let i = 0; i < 20; i++) {
  const ts = await get(`__backups/${i}/ts`); if (!ts) continue;
  const kind = await get(`__backups/${i}/kind`);
  let line = `__backups/${i}: ${T(ts)} ${kind || ''}`;
  if (ts >= DAY0) {
    const d = await get(`__backups/${i}/data`);
    try { const g = typeof d === 'string' ? JSON.parse(d) : d; out.push(line); console.log(line); matchInfo(g.db ? g : decode(g), `  копия ${i}`); continue; } catch (e) { line += ' (не читается)'; }
  }
  say(line);
}
// Разница копии 0 (So 00:03) и сейчас: по событиям, сколько ячеек игроков отличается
try {
  const d0 = await get('__backups/0/data'); const g0 = typeof d0 === 'string' ? JSON.parse(d0) : d0;
  const A = g0.db[BLK], B = G.db[BLK];
  const SA = A.sessions || [], SB = decode(B.sessions) || [];
  const PA = (A.players || []).filter(Boolean), PB = (decode(B.players) || []).filter(Boolean);
  say(`Копия 0 ↔ сейчас: событий ${SA.length}/${SB.length}, игроков ${PA.length}/${PB.length}`);
  const byName = Object.fromEntries(PB.map(p => [p.name, p]));
  const F = ['s', 'perf', 'rpe', 'goals', 'assists', 'excOK', 'ay'];
  const diff = {};
  PA.forEach(pa => { const pb = byName[pa.name]; if (!pb) { diff['нет игрока'] = (diff['нет игрока'] || 0) + 1; return; }
    F.forEach(f => { const a = pa[f] || [], b = pb[f] || []; const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) if (JSON.stringify(a[i] ?? null) !== JSON.stringify(b[i] ?? null)) { const k = f + '@' + ((SB[i] || SA[i] || {}).date || i); diff[k] = (diff[k] || 0) + 1; } }); });
  say('  отличия (поле@событие: игроков): ' + JSON.stringify(diff));
  const sd = [];
  SB.forEach((sb, i) => { const sa = SA[i]; if (JSON.stringify(sa) !== JSON.stringify(sb)) sd.push(((sb || sa || {}).date || i) + ':' + ['squad', 'mp', 'rep', 'rsvpUntil', 'time', 'notes'].filter(k => JSON.stringify((sa || {})[k]) !== JSON.stringify((sb || {})[k])).join('+')); });
  say('  события с отличиями: ' + sd.join(', '));
  const mlA = Object.keys(g0.matchLineups || {}).length, mlB = Object.keys(G.matchLineups || {}).length;
  say(`  расстановок: копия ${mlA}, сейчас ${mlB}; auditLog: копия ${(g0.auditLog || []).length} (последняя ${T(Math.max(0, ...(g0.auditLog || []).map(e => (e && e.ts) || 0)))})`);
} catch (e) { say('Сравнение не удалось: ' + e.message); }
say('__backups_meta/lastAutoDay: ' + await get('__backups_meta/lastAutoDay'));
const inb = await get('fcf_in'); say('fcf_in: записей ' + (inb ? Object.keys(inb).length : 0));
console.log('::notice title=Диагностика 08.11::' + out.join(' | ').replace(/\n/g, ' '));
process.exit(0);
