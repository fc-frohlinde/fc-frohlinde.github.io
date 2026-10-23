// Flutlicht · tests of eingang.mjs (the players' inbox, votes, winners).
// node test_eingang.mjs [path to index.html]   — pvApply comes from the app.
import { inbox, loadApply, winners } from './eingang.mjs';
import { sha, decode } from './lib.mjs';

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('ok   ' + m); else { fails++; console.log('FAIL ' + m); } };
const app = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const apply = loadApply(app);

// The app's storage format (fbEncodeValue): arrays wrapped, keys escaped
const ek = k => String(k).replace(/\//g, '__SL__').replace(/\./g, '__DOT__');
const enc = v => Array.isArray(v) ? { __arr: 1, v: v.map(enc) } : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [ek(k), enc(x)])) : v;
function memDb(root) {
  const parts = p => p.split('/').filter(Boolean);
  const get = p => { let x = root; for (const k of parts(p)) { if (x == null || typeof x !== 'object') return null; x = Array.isArray(x) ? x[+k] : x[k]; } return x === undefined ? null : JSON.parse(JSON.stringify(x)); };
  const set = (p, v) => { const ks = parts(p); let x = root; for (let i = 0; i < ks.length - 1; i++) { if (x[ks[i]] == null || typeof x[ks[i]] !== 'object') x[ks[i]] = {}; x = x[ks[i]]; } if (v === null) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = v;
    // like the database: a node without children is gone
    if (v === null) for (let i = ks.length - 1; i > 0; i--) { let y = root; for (let j = 0; j < i - 1; j++) y = y[ks[j]]; const c = y[ks[i - 1]]; if (c && typeof c === 'object' && !Object.keys(c).length) delete y[ks[i - 1]]; else break; } };
  return {
    root, get: async p => get(p),
    update: async m => { for (const [p, v] of Object.entries(m)) set(p, v && v.inc ? (get(p) || 0) + v.inc : v); },
    claim: async (p, t, now) => { const c = get(p); if (!c || c.m || c.t !== t) return false; set(p, Object.assign({}, c, { m: now })); return true; },
    inc: k => ({ inc: k }), peek: get,
  };
}
const T0 = Date.UTC(2026, 9, 25, 14, 30);   // Sun 25.10, 15:30 Berlin
const sess = [
  { date: 'So 18.10', time: '13:00', type: 'match', mvp: { c: { 'Ali Kaya': 4, 'Tom Berg': 2 } } },
  { date: 'Di 20.10', time: '18:30', type: 'training' },
  { date: 'So 25.10', time: '13:00', type: 'match' },
  { date: 'Di 27.10', time: '18:30', type: 'training', rsvpUntil: Date.UTC(2026, 9, 27, 11) },
];
const names = ['Max Müller', 'Ali Kaya', 'Tom Berg', 'Jonas Weber', 'Luca Rossi'];
const players = names.map((name, i) => ({ name, confirmToken: 'p' + i, s: [1, 1, 4, i === 2 ? 2 : 3], rpe: [5, 6, null, null] }));
players[4].s = [1, 1, 4];   // shorter array: a new player
const LK = '0123456789abcdef0123', TK = sha('fcf-pt|' + LK);
const db = memDb({ fcf_data: { db: { [ek('U19__2026/27')]: enc({ sessions: sess, players }), U19__rules: { lk: LK } } } });
const pk = i => sha('fcf-pv|p' + i);
const blk = () => decode(db.root.fcf_data.db[ek('U19__2026/27')]);

// ── answers ──
db.root.fcf_in = {
  [pk(1)]: { 'a_k1027-1830t': { a: 'rsvp', k: 'k1027-1830t', si: 3, v: 0, t: T0 }, 'r_k1025-1300m': { a: 'rpe', k: 'k1025-1300m', si: 2, v: 7, t: T0 } },
  [pk(2)]: { 'a_k1027-1830t': { a: 'rsvp', k: 'k1027-1830t', si: 3, v: 1, t: T0 } },               // excused → Komme
  [pk(4)]: { 'a_k1027-1830t': { a: 'rsvp', k: 'k1027-1830t', si: 9, v: 1, t: T0 } },               // wrong index, right key; short array
  [pk(3)]: { 'a_k1027-1830t': { a: 'rsvp', k: 'k1027-1830t', si: 3, v: 1, t: Date.UTC(2026, 9, 27, 12) } }, // after the deadline
  ['f'.repeat(64)]: { seen: { a: 'seen', v: { t: T0 }, t: T0 } },                                    // nobody's
};
let r = await inbox({ db, apply, ts: T0 + 60e3 });
let B = blk();
ok(r.merged === 4 && r.refused === 1 && r.why.frist === 1 && r.unknown === 1, 'merged 4, one after the deadline, one unknown: ' + JSON.stringify(r));
ok(B.players[1].s[3] === 0 && B.players[1].rpe[2] === 7 && B.players[1].rpeMeta['k1025-1300m'].s === 'p', 'Ali: Kann nicht, rating 7, its origin');
ok(B.players[2].s[3] === 4 && B.players[2].excOK[3] === true, 'Tom (excused) comes after all: Angemeldet, the excuse remembered (excOK)');
ok(B.players[4].s[3] === 4, 'Luca: found by the key, whole array written for the short one');
ok(db.peek(`fcf_data/db/${ek('U19__2026/27')}/players/v/1/s/v/3`) === 0, 'single index written where the array is there');
ok(B.players[3].s[3] === 3 && !db.peek(`fcf_in/${pk(3)}/a_k1027-1830t`), 'late answer refused and removed');
ok(db.peek(`fcf_in/${pk(1)}/a_k1027-1830t`).m === T0 + 60e3, 'merged entry kept with m');
const aud = Object.values(db.peek('fcf_data/auditLogP') || {});
ok(aud.some(a => a.action === 'Anmeldung (Spieler-App)' && a.user === 'Ali Kaya' && /Di 27\.10 \(Training\): Ausstehend → Fehlend/.test(a.details)), 'journal: Ali');

// ── clean-up: once a newer slice has it ──
db.root.fcf_pv = { [pk(1)]: { t: T0 + 10 * 60e3, h: 'x', j: '{}' } };
r = await inbox({ db, apply, ts: T0 + 11 * 60e3 });
ok(!db.peek(`fcf_in/${pk(1)}`) && db.peek(`fcf_in/${pk(2)}/a_k1027-1830t`), 'cleaned where the slice is newer, kept elsewhere: ' + JSON.stringify(r));

// ── roll call wins over a late merge ──
db.root.fcf_data.db[ek('U19__2026/27')].players.v[0].s.v[2] = 1;
db.root.fcf_in[pk(0)] = { 'a_k1025-1300m': { a: 'rsvp', k: 'k1025-1300m', si: 2, v: 0, t: T0 } };
r = await inbox({ db, apply, ts: T0 + 12 * 60e3 });
ok(blk().players[0].s[2] === 1 && r.why.trainer === 1, 'present (roll call) stays present');

// ── votes ──
db.root.fcf_vote = {
  [pk(1)]: { 'k1025-1300m': { n: 'Tom Berg', t: T0 } },
  [pk(3)]: { 'k1025-1300m': { n: 'Tom Berg', t: T0 } },
  [pk(4)]: { 'k1025-1300m': { n: 'Luca Rossi', t: T0 } },          // himself
  [pk(0)]: { 'k1025-1300m': { n: 'Tom Berg', t: Date.UTC(2026, 9, 27, 9) } },   // Tuesday: closed
};
r = await inbox({ db, apply, ts: T0 + 20 * 60e3 });
B = blk();
ok(r.votes === 2 && r.voteRefused === 2 && B.sessions[2].mvp.c['Tom Berg'] === 2, 'two votes counted, self and late refused: ' + JSON.stringify(r));
ok(B.players[1].mvpV['k1025-1300m'] === 1 && !db.peek('fcf_vote'), 'voter marked, votes gone');
db.root.fcf_vote = { [pk(1)]: { 'k1025-1300m': { n: 'Jonas Weber', t: T0 } } };
r = await inbox({ db, apply, ts: T0 + 25 * 60e3 });
ok(r.votes === 0 && r.voteRefused === 1, 'second vote refused');
db.root.fcf_vote = { [pk(4)]: { 'k1025-1300m': { n: 'Tom Berg', t: T0 } } };
await inbox({ db, apply, ts: T0 + 26 * 60e3 });
// ── winners once closed (Tuesday) ──
r = await inbox({ db, apply, ts: Date.UTC(2026, 9, 27, 8) });
const mv = db.peek(`fcf_pt/${TK}/mvp`) || {};
ok(JSON.stringify(mv['k1025-1300m']) === '["Tom Berg"]' && JSON.stringify(mv['k1018-1300m']) === '["Ali Kaya"]', 'winners of closed votes published: ' + JSON.stringify(mv));
r = await inbox({ db, apply, ts: Date.UTC(2026, 9, 27, 8, 15) });
ok(r.winners === 0, 'not written twice');
ok(JSON.stringify(winners({ A: 2, B: 2 })) === '["A","B"]' && winners({ A: 2 }).length === 0 && winners({ A: 2, B: 2, C: 2 }).length === 0, 'winner rule as in the app');

console.log(fails ? fails + ' FAILED' : 'all passed', `(${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
