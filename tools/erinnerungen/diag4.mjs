// Сверка журнала игроков с данными (только чтение, только числа): что игроки
// ответили/оценили через приложение и чего нет в данных.
import admin from 'firebase-admin';
import { decode } from './lib.mjs';
const DB_URL = 'https://fc-frohlinde-ea23f-default-rtdb.europe-west1.firebasedatabase.app';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), databaseURL: DB_URL });
const raw = (await admin.database().ref('fcf_data').get()).val(); const G = decode(raw);
const blk = G.db['U19__2026/27']; const S = blk.sessions, P = blk.players.filter(Boolean);
const norm = d => String(d || '').replace(/\b0(\d)/g, '$1').trim();
const byName = Object.fromEntries(P.map(p => [p.name, p]));
const NAME2VAL = { 'Fehlend': 0, 'Anwesend': 1, 'Entschuldigt': 2, 'Ausstehend': 3, 'Angemeldet': 4, 'Nicht im Kader': 5 };
const lp = Object.values(raw.auditLogP || {}).filter(Boolean).sort((a, b) => (a.ts || 0) - (b.ts || 0));
// ratings
const rl = {};
lp.filter(e => e.action === 'Belastung bewertet').forEach(e => { rl[e.user + '|' + norm(e.target)] = e; });
const rMiss = {}; let rOk = 0, rN = 0;
for (const [k, e] of Object.entries(rl)) {
  const p = byName[e.user]; if (!p) continue;
  const si = S.findIndex(s => s && norm(s.date) === norm(e.target)); if (si < 0) continue;
  const m = /RPE\s+(\d+)/.exec(e.detail || ''); if (!m) continue; rN++;
  const v = Array.isArray(p.rpe) ? p.rpe[si] : null;
  if (v == null) rMiss[S[si].date] = (rMiss[S[si].date] || 0) + 1; else rOk++;
}
// answers
const al = {};
lp.filter(e => /^Anmeldung \(Spieler-App\)/.test(e.action || '')).forEach(e => {
  const m = String(e.details || e.detail || '').match(/^(.+?):\s*.*?→\s*(\w[\w ]*)/); if (!m) return;
  al[e.target + '|' + m[1].trim()] = { e, label: m[1].trim(), val: NAME2VAL[m[2].trim()] };
});
const aMiss = {}; let aN = 0, aSame = 0;
for (const x of Object.values(al)) {
  const p = byName[x.e.target]; if (!p || x.val === undefined) continue;
  const si = S.findIndex(s => s && (s.date + (s.type === 'match' ? ' (Spiel)' : ' (Training)')) === x.label); if (si < 0) continue;
  aN++;
  const cur = Array.isArray(p.s) ? p.s[si] : 3;
  if (cur === x.val) { aSame++; continue; }
  // the trainer may have changed it since (roll call, excuse): only a gap is suspicious
  const key = S[si].date + ' ' + (x.val === 0 ? 'Absage' : x.val === 4 ? 'Zusage' : x.val);
  if (cur === 3 || cur === 4 && x.val === 0) aMiss[key] = (aMiss[key] || 0) + 1;
}
const out = [
  `Оценки в журнале: ${rN}, в данных есть ${rOk}; нет в данных по датам: ${JSON.stringify(rMiss)}`,
  `Ответы игроков в журнале (последний на игрока и занятие): ${aN}, совпадают ${aSame}; нет в данных (в данных «нет ответа» или M вместо отказа): ${JSON.stringify(aMiss)}`,
  `Журнал игроков: ${lp.length} записей с ${lp.length ? new Date(lp[0].ts).toISOString().slice(0, 10) : '-'}`,
];
out.forEach(l => console.log(l));
console.log('::notice title=Сверка журнала игроков::' + out.join(' || '));
process.exit(0);
