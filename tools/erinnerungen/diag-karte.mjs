// Диагностика «Meine Karte» (только чтение, в лог только числа — лог публичный).
// Считает уровни карточек тем же кодом, что приложение: index.html в Chromium,
// данные — из базы. Плюс по каждому занятию с 17.10: сколько было, сколько оценили.
import admin from 'firebase-admin';
import { chromium } from 'playwright';
import path from 'node:path';
const DB_URL = 'https://fc-frohlinde-ea23f-default-rtdb.europe-west1.firebasedatabase.app';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), databaseURL: DB_URL });
const raw = (await admin.database().ref('fcf_data').get()).val();
const b = await chromium.launch();
const pg = await b.newPage();
pg.on('pageerror', () => {});
await pg.goto('file://' + path.resolve('../../index.html'));
await pg.waitForTimeout(2500);
const r = await pg.evaluate((raw) => {
  G = sanitizeG(fbDecode(raw));
  UI.currentTeam = 'U19'; UI.currentSeason = '2026/27';
  CU = { role: 'admin', name: 'Admin', teams: [] };
  const D = cd(), season = UI.currentSeason;
  const tiers = { 0: 0, 1: 0, 2: 0, 3: 0 }, near = [], rq = [];
  let n = 0;
  D.players.forEach(p => {
    if (!p || !p.name || (typeof _pGone === 'function' && _pGone(p)) || p.trial) return;
    const d = cardData(p, D, season); if (!d) return;
    n++; tiers[d.ti]++;
    rq.push(d.rq + ':' + (d.rated == null ? '-' : d.rated));
    if (d.pct >= 95 && d.t >= CARD_FL_MIN) near.push({ pct: d.pct, t: d.t, rated: d.rated, rq: d.rq, fl: d.ti === 3 });
  });
  // по занятиям с 17.10: отмечено присутствующих, из них оценили; оценки без отметки
  const sess = [];
  D.sessions.forEach((s, si) => {
    if (!s || !s.date || !sessTookPlace(s, season) || _dbSortKey(s.date, season) < CARD_RATED_FROM) return;
    let a = 0, ra = 0, extra = 0;
    D.players.forEach(p => {
      if (!p) return; const v = Array.isArray(p.s) ? p.s[si] : 3;
      const num = Array.isArray(p.rpe) && typeof p.rpe[si] === 'number';
      if (v === 1) { a++; if (rpeAnswered(p, si, s)) ra++; } else if (num) extra++;
    });
    sess.push(s.date + (s.type === 'match' ? ' Spiel' : '') + ': был ' + a + ', оценили ' + ra + (extra ? ', ещё оценок без отметки ' + extra : ''));
  });
  return { n, tiers, near, rq, sess };
}, raw);
await b.close();
const T = ['Bronze', 'Silber', 'Gold', 'Flutlicht'];
const out = [
  `Игроков с карточкой: ${r.n}; уровни: ` + Object.entries(r.tiers).map(([k, v]) => T[k] + ' ' + v).join(', '),
  `Посещаемость ≥95 % и ≥8 занятий: ${r.near.length}` + (r.near.length ? ' — ' + r.near.map(x => `${x.pct}%/${x.t} занятий, оценено ${x.rated == null ? '–' : x.rated + '%'} из ${x.rq}${x.fl ? ' (Flutlicht)' : ''}`).join('; ') : ''),
  'Оценено (занятий:%), все игроки: ' + r.rq.join(' '),
  'Занятия с 17.10: ' + r.sess.join(' | '),
];
out.forEach(l => console.log(l));
console.log('::notice title=Диагностика карточки::' + out.join(' || '));
process.exit(0);
