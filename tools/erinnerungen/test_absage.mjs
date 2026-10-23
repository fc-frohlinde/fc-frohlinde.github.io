// Flutlicht · tests of the Absage-Regel (1.2.45) in pvApply, as the job runs it.
// node test_absage.mjs [path to index.html]
import { inbox, loadApply } from './eingang.mjs';
import { sha, decode } from './lib.mjs';
import { cancellations } from './trainer.mjs';

let fails = 0, n = 0;
const ok = (c, m, x) => { n++; if (c) console.log('ok   ' + m); else { fails++; console.log('FAIL ' + m + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };
const app = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const apply = loadApply(app);

// Tue 03.11, 18:30 Berlin = 17:30 UTC (winter time); 4 h before: 13:30 UTC
const U = (d, h, m = 0) => Date.UTC(2026, 10, d, h, m);
const mk = () => ({
  sessions: [
    { date: 'Di 03.11', time: '18:30', type: 'training' },
    { date: 'So 08.11', time: '13:00', type: 'match', squad: { p: ['Ali Kaya'], out: [], meet: '11:45', where: '', t: U(6, 18), by: 'Artem' } },
    { date: 'Do 05.11', time: '18:30', type: 'training', rsvpUntil: U(5, 11) },   // own deadline 12:00 Berlin
    { date: 'Di 27.10', time: '18:30', type: 'training' },                          // after 25.10 it is CET: 18:30 = 17:30 UTC
  ],
  players: [{ name: 'Ali Kaya', s: [4, 4, 4, 4], ay: [1, null, null, null] }, { name: 'Tom Berg', s: [4, 4, 4, 4] }],
});
const E = (si, v, st, k) => ({ a: 'rsvp', k: k || ['k1103-1830t', 'k1108-1300m', 'k1105-1830t', 'k1027-1830t'][si], si, v, t: st != null ? st : U(1, 9), ...(st != null ? { st } : {}) });
const run = (R, pi, e, b) => { b = b || mk(); const r = apply(b, pi, e, R); return { r, s: b.players[pi].s[e.si], x: (b.players[pi].excOK || [])[e.si], b }; };

// ── frist (default): 4 h before the start ──
let x = run(undefined, 0, E(0, 0, U(3, 13, 0)));
ok(x.r.ok && x.s === 2 && x.x === 'a' && /rechtzeitig/.test(x.r.audit.details), 'in time (13:00 UTC, frist 13:30): excused, marked "a"', x);
x = run(undefined, 0, E(0, 0, U(3, 13, 30)));
ok(x.s === 2, 'exactly at the frist: excused');
x = run(undefined, 0, E(0, 0, U(3, 13, 31)));
ok(x.s === 0 && x.x == null, 'one minute late: Fehlend, call needed', x);
x = run(undefined, 0, { a: 'rsvp', k: 'k1103-1830t', si: 0, v: 0, t: U(3, 9) });
ok(x.s === 0, 'no server time (old app): Fehlend, the call decides');
x = run({ abs: { m: 'frist', h: 6 } }, 0, E(0, 0, U(3, 12)));
ok(x.s === 0, 'h = 6: 12:00 UTC is after 11:30 UTC → Fehlend');
x = run({ abs: { m: 'frist', h: 6 } }, 0, E(0, 0, U(3, 11, 30)));
ok(x.s === 2, 'h = 6: 11:30 UTC in time');
// own deadline wins
x = run(undefined, 0, E(2, 0, U(5, 10, 59)));
ok(x.s === 2, 'session with its own deadline: before it → excused');
x = run(undefined, 0, E(2, 0, U(5, 11, 1)), (() => { const b = mk(); return b; })());
ok(!x.r.ok && x.r.why === 'frist', 'after its own deadline: refused as before (no answers any more)', x.r);
// summer/winter time: 27.10 is CET (UTC+1): 18:30 → 17:30 UTC, frist 13:30 UTC
x = run(undefined, 0, E(3, 0, Date.UTC(2026, 9, 27, 13, 29)));
ok(x.s === 2, '27.10 (CET): 13:29 UTC in time');
x = run(undefined, 0, E(3, 0, Date.UTC(2026, 9, 27, 13, 31)));
ok(x.s === 0, '27.10 (CET): 13:31 UTC late');
// ── a match: once he is in the published squad, only a call ──
x = run(undefined, 0, E(1, 0, U(6, 19)));
ok(x.s === 0, 'in the published squad: Fehlend, call needed');
x = run(undefined, 0, E(1, 0, U(6, 17)));
ok(x.s === 2, 'before the squad was published: excused');
x = run(undefined, 1, E(1, 0, U(6, 19)));
ok(x.s === 2, 'not in the squad: excused');
// ── modes ──
x = run({ abs: { m: 'anruf' } }, 0, E(0, 0, U(1, 9)));
ok(x.s === 0, '"immer per Anruf": Fehlend even days ahead');
x = run({ abs: { m: 'app' } }, 0, E(0, 0, U(3, 17)));
ok(x.s === 2 && x.x === 'a', '"die App reicht immer": excused even late');
x = run({ abs: { m: 'app' } }, 0, { a: 'rsvp', k: 'k1103-1830t', si: 0, v: 0, t: U(3, 9) });
ok(x.s === 2, '"die App reicht immer": also without server time');
// ── no loophole: an app excuse does not come back late ──
let b = mk();
run(undefined, 0, E(0, 0, U(1, 9)), b);
x = run(undefined, 0, E(0, 1, U(2, 9)), b);
ok(x.s === 4 && x.x == null, 'excused by the app, then "Komme": Angemeldet, mark gone', x);
x = run(undefined, 0, E(0, 0, U(3, 15)), b);
ok(x.s === 0, '… then "Kann nicht" late: Fehlend (not excused again)', x);
b = mk(); run(undefined, 0, E(0, 0, U(1, 9)), b);
x = run(undefined, 0, E(0, 0, U(3, 16)), b);
ok(x.s === 2 && x.x === 'a', '"Kann nicht" tapped again late: stays excused');
// the trainers' excuse still comes back
b = mk(); b.players[1].s[0] = 2; b.players[1].excOK = [true];
run(undefined, 1, E(0, 1, U(2, 9)), b);
x = run(undefined, 1, E(0, 0, U(3, 16)), b);
ok(x.s === 2 && x.x === true, 'excused by the trainers, Komme, Kann nicht late: excused again (their decision)');
// an old Fehlend confirmed in time
b = mk(); b.players[0].s[0] = 0;
x = run(undefined, 0, E(0, 0, U(2, 9)), b);
ok(x.s === 2 && x.x === 'a', 'Fehlend from before, confirmed in time: excused');
// the player's own device: his clock (trustT)
x = run({ trustT: true }, 0, { a: 'rsvp', k: 'k1103-1830t', si: 0, v: 0, t: U(3, 9), st: { '.sv': 'timestamp' } });
ok(x.s === 2, 'own device, not yet on the server: shown as excused');

// ── the job reads the team's rules ──
const ek = k => String(k).replace(/\//g, '__SL__').replace(/\./g, '__DOT__');
const enc = v => Array.isArray(v) ? { __arr: 1, v: v.map(enc) } : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, y]) => [ek(k), enc(y)])) : v;
function memDb(root) {
  const parts = p => p.split('/').filter(Boolean);
  const get = p => { let y = root; for (const k of parts(p)) { if (y == null || typeof y !== 'object') return null; y = y[k]; } return y === undefined ? null : JSON.parse(JSON.stringify(y)); };
  const set = (p, v) => { const ks = parts(p); let y = root; for (let i = 0; i < ks.length - 1; i++) { if (y[ks[i]] == null || typeof y[ks[i]] !== 'object') y[ks[i]] = {}; y = y[ks[i]]; } if (v === null) delete y[ks[ks.length - 1]]; else y[ks[ks.length - 1]] = v; };
  return { root, get: async p => get(p), update: async m => { for (const [p, v] of Object.entries(m)) set(p, v); },
    claim: async (p, t, now) => { const c = get(p); if (!c || c.m || c.t !== t) return false; set(p, Object.assign({}, c, { m: now })); return true; }, inc: k => ({ inc: k }) };
}
const blkData = mk(); blkData.players.forEach((p, i) => { p.confirmToken = 'p' + i; });
for (const [mode, want] of [['frist', 2], ['anruf', 0]]) {
  const db = memDb({ fcf_data: { db: { [ek('U19__2026/27')]: enc(blkData), U19__rules: enc({ lk: 'x', abs: { m: mode, h: 4 } }) } },
    fcf_in: { [sha('fcf-pv|p0')]: { 'a_k1103-1830t': E(0, 0, U(3, 12)) } } });
  const r = await inbox({ db, apply, ts: U(3, 12, 5) });
  const s = decode(db.root.fcf_data.db[ek('U19__2026/27')]).players[0].s[0];
  ok(r.merged === 1 && s === want, `job with rule "${mode}": status ${s}`, r);
}

// ── trainers hear of a late cancellation the app excused too ──
const bb = { season: '2026/27', sessions: [{ date: 'Di 03.11', time: '18:30', type: 'training' }],
  players: [{ name: 'Ali Kaya', s: [4] }, { name: 'Tom Berg', s: [4] }] };
const now = { ts: U(3, 9), day: 20261103, min: 10 * 60 };
const first = cancellations(bb, now, {});
bb.players[0].s = [2]; bb.players[0].excOK = ['a'];
bb.players[1].s = [2]; bb.players[1].excOK = [true];
const c2 = cancellations(bb, { ts: U(3, 10), day: 20261103, min: 11 * 60 }, first.snap);
ok(c2.items.length === 1 && /Ali Kaya hat abgesagt/.test(c2.items[0].body) && !/Tom/.test(c2.items[0].body), 'trainers: app excuse counts as a cancellation, a trainer\'s E does not', c2.items.map(i => i.body));

console.log(fails ? fails + ' FAILED' : 'all ' + n + ' passed');
process.exit(fails ? 1 : 0);
