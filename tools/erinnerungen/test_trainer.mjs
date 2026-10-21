// Benachrichtigungen für Trainer: rounds against an in-memory database. node test_trainer.mjs
import { round } from './round.mjs';
import { trainerOwner, kindsOf, TKINDS } from './trainer.mjs';
import { ownerOf } from './lib.mjs';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const enc = v => {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) {
    const a = v.map(x => enc(x));
    const filled = a.filter(x => x !== null).length;
    if (filled * 2 < a.length) { const o = {}; a.forEach((x, i) => { if (x !== null) o[i] = x; }); return { __arr: 1, v: o }; }
    return { __arr: 1, v: a };
  }
  if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { const e = enc(v[k]); if (e !== null) o[k] = e; } return o; }
  return v;
};
const fmt = x => ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][x.getDay()] + ' ' + String(x.getDate()).padStart(2, '0') + '.' + String(x.getMonth() + 1).padStart(2, '0');
function makeDb(init) {
  const root = JSON.parse(JSON.stringify(init));
  const walk = p => p.split('/').filter(Boolean);
  const get = p => { let o = root; for (const k of walk(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } if (o === undefined || (o && typeof o === 'object' && !Object.keys(o).length)) return null; return JSON.parse(JSON.stringify(o)); };
  const set = (p, v) => { const ks = walk(p); let o = root; ks.slice(0, -1).forEach(k => { o = o[k] = (o[k] && typeof o[k] === 'object') ? o[k] : {}; }); if (v === null || v === undefined) delete o[ks.at(-1)]; else o[ks.at(-1)] = JSON.parse(JSON.stringify(v)); };
  return { root, get: async p => get(p), set: async (p, v) => set(p, v), remove: async p => set(p, null) };
}
function makePush() {
  const calls = [];
  return { calls, generateVAPIDKeys: () => ({ publicKey: 'PUB', privateKey: 'PRIV' }), setVapidDetails() {},
    async sendNotification(sub, payload, opt) { calls.push({ to: sub.endpoint.replace('https://push.example/', ''), p: JSON.parse(payload), opt }); } };
}
const dev = (ep, extra) => Object.assign({ e: 'https://push.example/' + ep, k: { p256dh: 'x', auth: 'y' }, t: 1, team: 'U19', season: '2026/27' }, extra || {});
const q = () => {};
// Berlin: UTC+2 until the night to Sun 25.10, then UTC+1
const at = (d, h, m) => Date.UTC(2026, 9, d, h - (d >= 25 ? 1 : 2), m);

function world(edit) {
  const sess = [];
  for (let x = new Date(2026, 7, 4); x <= new Date(2026, 10, 10); x.setDate(x.getDate() + 1)) {
    const dw = x.getDay();
    if (dw === 2 || dw === 4) sess.push({ date: fmt(x), type: 'training', time: '18:30', duration: 90 });
    if (dw === 0) sess.push({ date: fmt(x), type: 'match', time: '13:00', duration: 90, label: 'SV Brackel' });
  }
  const names = ['Max Müller', 'Ali Kaya', 'Tom Berg', 'Jonas Weber', 'Luca Rossi', 'Finn Schulz', 'Noah Becker'];
  const players = names.map((n, i) => ({ name: n, nr: i + 1, confirmToken: 'tok' + i, birthdate: '2008-0' + (1 + i) + '-1' + i,
    s: sess.map((s, j) => j < sess.findIndex(z => z.date === 'Do 15.10') ? 1 : 3) }));
  const W = { sess, players, trainers: [{ name: 'Artem', teams: ['U19'] }, { name: 'Jimmy', teams: ['U19'] }, { name: 'Udo', teams: ['U17'] }],
    ua: { Artem: { rollCall: { enabled: false }, push: { late: true, lineup: true } } }, messages: [], meta: null, status: null,
    subs: {
      [trainerOwner('Artem')]: { a: dev('artem', { tp: 1, trainer: 'Artem' }) },
      [trainerOwner('Jimmy')]: { a: dev('jimmy', { tp: 1, trainer: 'Jimmy' }) },
      [trainerOwner('Mallory')]: { a: dev('mallory', { tp: 1, trainer: 'Mallory' }) },       // not a trainer
      [trainerOwner('Udo')]: { a: dev('udo', { tp: 1, trainer: 'Udo' }) },                   // trainer of another team
      tFAKE00000000000000000000: { a: dev('fake', { tp: 1, trainer: 'Artem' }) },              // record not where it belongs
      [trainerOwner('Testi')]: { a: dev('testi', { trainer: 'Testi' }) },                     // only a test device
      [ownerOf('tok0')]: { a: dev('max') },                                                  // a player
    } };
  if (edit) edit(W);
  const si = d => W.sess.findIndex(s => s.date === d);
  const db = makeDb({
    fcf_data: { trainers: enc(W.trainers), userAutomation: W.ua, messages: enc(W.messages),
      db: { 'U19__2026__SL__27': { sessions: enc(W.sess), players: enc(W.players) } } },
    __backups_meta: W.meta ? { safe: W.meta } : {}, fcf_push: Object.assign({ subs: W.subs }, W.status ? { status: W.status } : {}) });
  return { db, W, si };
}
const run = async (db, ts) => { const push = makePush(); await round({ db, push, ts, log: q }); return push.calls; };
const T = calls => calls.filter(c => c.p.tag !== 'test' && !/^(rpe|vote|rsvp)-/.test(c.p.tag));
const B = calls => T(calls).filter(c => /^bday-/.test(c.p.tag));
const who = calls => T(calls).map(c => c.to).sort().join(',');

ok(JSON.stringify(kindsOf(null)) === JSON.stringify(TKINDS) && kindsOf({ bday: false, late: true }).bday === false && kindsOf({ late: true }).late === true, 'kinds: defaults, own choice wins');

// ── birthdays: Ali turns 18 on Thu 22.10 ──
{
  const { db, si } = world(W => { W.players[1].birthdate = '2008-10-22'; });
  let c = await run(db, at(21, 17, 52));
  ok(!B(c).length, 'evening before: not before 18:00');
  c = await run(db, at(21, 18, 7));
  ok(B(c).map(x => x.to).sort().join(',') === 'artem,jimmy', 'evening before: both trainers of the team, nobody else: ' + B(c).map(x => x.to).sort().join(','));
  const p = B(c)[0].p;
  ok(p.title === 'Morgen Geburtstag 🎂' && p.body === 'Ali Kaya wird 18. Morgen Training um 18:30.', 'text: ' + p.title + ' / ' + p.body);
  ok(p.url === 'https://fc-frohlinde.github.io/?go=player&gi=1&gt=U19&gs=2026%2F27', 'link opens his profile: ' + p.url);
  c = await run(db, at(21, 18, 22));
  ok(!B(c).length, 'once');
  c = await run(db, at(22, 7, 52));
  ok(!B(c).length, 'the day: nothing before 8:00');
  c = await run(db, at(22, 8, 7));
  ok(B(c).map(x => x.to).sort().join(',') === 'artem,jimmy' && B(c)[0].p.title === 'Heute Geburtstag 🎉' && B(c)[0].p.body === 'Ali Kaya wird heute 18.', 'the day itself: ' + B(c).map(x => x.p.body).join(' | '));
  c = await run(db, at(22, 8, 22));
  ok(!B(c).length, 'the day: once');
}
{
  const { db } = world(W => { W.players[1].birthdate = '2008-10-21'; W.players[2].birthdate = '09.10.2009'.replace('09.10', '21.10'); W.ua.Jimmy = { push: { bday: false } }; });
  const c = await run(db, at(21, 8, 7));
  ok(B(c).map(x => x.to).sort().join(',') === 'artem' && B(c)[0].p.body === 'Ali Kaya (18) und Tom Berg (17) haben heute Geburtstag.', 'two at once, Jimmy switched birthdays off: ' + B(c).map(x => x.to).sort().join(',') + ' ' + (B(c)[0] || { p: {} }).p.body);
}
// ── roll call missing: training Tue 20.10 ──
{
  const { db, si } = world(W => { const i = W.sess.findIndex(s => s.date === 'Di 20.10'); W.players.forEach(p => { p.s[i] = 4; }); W.players[5].s[i] = 2; });
  let c = await run(db, at(21, 8, 52));
  ok(!T(c).filter(x => /^att/.test(x.p.tag)).length, 'roll call: not before 9:00');
  c = await run(db, at(21, 9, 7));
  const a = T(c).filter(x => /^att/.test(x.p.tag));
  ok(a.map(x => x.to).sort().join() === 'artem,jimmy' && a[0].p.title === 'Anwesenheit fehlt'
    && a[0].p.body === 'Training Di 20.10: noch nicht eingetragen. Ohne Eintrag zählen Karte und Statistik der Spieler nicht.', 'roll call missing: ' + (a[0] || { p: {} }).p.body);
  ok(a[0].p.url.includes('go=rc&gi=' + si('Di 20.10') + '&gt=U19'), 'link opens the roll call: ' + a[0].p.url);
  c = await run(db, at(21, 9, 22));
  ok(!T(c).filter(x => /^att/.test(x.p.tag)).length, 'roll call: once');
}
{
  const { db } = world(W => { const i = W.sess.findIndex(s => s.date === 'Di 20.10'); W.players.forEach(p => { p.s[i] = 1; }); W.players[2].s[i] = 3; W.players[3].s[i] = 4; W.players[4].s[i] = 0; });
  const c = await run(db, at(21, 9, 7));
  const a = T(c).filter(x => /^att/.test(x.p.tag));
  ok(a.length === 2 && a[0].p.body === 'Training Di 20.10: 2 Spieler noch ohne Eintrag.', 'partly entered: ' + (a[0] || { p: {} }).p.body);
}
{
  const { db } = world(W => { const i = W.sess.findIndex(s => s.date === 'Di 20.10'); W.players.forEach(p => { p.s[i] = 1; }); W.players[4].s[i] = 0; W.players[5].s[i] = 2; });
  const c = await run(db, at(21, 9, 7));
  ok(!T(c).filter(x => /^att/.test(x.p.tag)).length, 'all entered: nothing');
}
// ── a cancellation shortly before Thu 22.10 18:30 ──
{
  const { db, W, si } = world(W => { const i = W.sess.findIndex(s => s.date === 'Do 22.10'); W.players.forEach(p => { p.s[i] = 4; }); W.players[6].s[i] = 0; });
  const i = si('Do 22.10');
  let c = await run(db, at(21, 19, 0));
  ok(!T(c).filter(x => /^late/.test(x.p.tag)).length, 'first look: only takes note');
  const pp = await db.get('fcf_data/db/U19__2026__SL__27/players');
  const setSt = async (pi, v) => { const path = `fcf_data/db/U19__2026__SL__27/players/v/${pi}/s/v/${i}`; await db.set(path, v); };
  await setSt(2, 0);                                                         // Tom: kann nicht
  await setSt(5, 2);                                                         // trainer excuses Finn
  c = await run(db, at(21, 19, 15));
  let l = T(c).filter(x => /^late/.test(x.p.tag));
  ok(l.map(x => x.to).join() === 'artem' && l[0].p.title === 'Absage: Training morgen 18:30' && l[0].p.body === 'Tom Berg hat abgesagt. Jetzt 4 dabei.',
    'Tom cancels: only Artem (Jimmy left it off), excused Finn and Noah (no before) not: ' + l.map(x => x.to + ' ' + x.p.body).join(' | '));
  ok(l[0].p.url.includes('go=sess&gi=' + i), 'link opens the session');
  c = await run(db, at(21, 19, 30));
  ok(!T(c).filter(x => /^late/.test(x.p.tag)).length, 'once');
  await setSt(3, 0); await setSt(4, 0);                                      // two more, late at night
  c = await run(db, at(21, 23, 7));
  ok(!T(c).length, 'night: nothing');
  c = await run(db, at(22, 8, 7));
  l = T(c).filter(x => /^late/.test(x.p.tag));
  ok(l.length === 1 && l[0].p.title === 'Absage: Training heute 18:30' && l[0].p.body === 'Jonas Weber und Luca Rossi haben abgesagt. Jetzt 2 dabei.', 'night cancellations in the morning: ' + l.map(x => x.p.body).join(' | '));
  c = await run(db, at(22, 18, 37));
  ok(!(await db.get('fcf_push/tsnap/U19__2026__SL__27')), 'after the start: notes removed');
}
// ── answers 3 h before the start ──
{
  const { db } = world(W => { const i = W.sess.findIndex(s => s.date === 'Do 22.10'); W.players.forEach((p, k) => { p.s[i] = k < 4 ? 4 : k === 4 ? 0 : 3; }); });
  let c = await run(db, at(22, 15, 22));
  ok(!T(c).filter(x => /^lineup/.test(x.p.tag)).length, 'not 3 h 8 min before');
  c = await run(db, at(22, 15, 37));
  const l = T(c).filter(x => /^lineup/.test(x.p.tag));
  ok(l.map(x => x.to).join() === 'artem' && l[0].p.title === 'Training heute 18:30' && l[0].p.body === '4 dabei, 1 abgesagt, 2 offen', 'lineup: ' + l.map(x => x.to + ' ' + x.p.title + ' / ' + x.p.body).join(' | '));
  c = await run(db, at(22, 15, 52));
  ok(!T(c).filter(x => /^lineup/.test(x.p.tag)).length, 'once');
}
{
  const { db } = world();
  const c = await run(db, at(25, 8, 7));                                      // Sunday 13:00 match: 10:00 would be the time, 8:07 is the first round (quiet before 8)
  ok(!T(c).filter(x => /^lineup/.test(x.p.tag)).length, 'match: not 5 h before');
  const c2 = await run(db, at(25, 10, 7));
  ok(T(c2).filter(x => /^lineup/.test(x.p.tag)).map(x => x.p.title).join() === 'Spiel gegen SV Brackel heute 13:00', 'match title');
}
// ── messages between trainers ──
{
  const n = at(21, 12, 0);
  const { db } = world(W => { W.messages = [
    { id: 'msg_1', from: 'Jimmy', to: '*', text: 'Halle ist morgen zu.', ts: n - 10 * 60e3 },
    { id: 'msg_2', from: 'Artem', to: '*', text: 'Ok', ts: n - 5 * 60e3 },
    { id: 'msg_3', from: 'Udo', to: 'Artem', text: 'Hast du Hütchen?', ts: n - 60e3 },
    { id: 'msg_old', from: 'Jimmy', to: '*', text: 'alt', ts: n - 30 * 3600e3 }]; });
  let c = await run(db, at(21, 12, 7));
  const m = T(c).filter(x => /^msg/.test(x.p.tag)).map(x => x.to + ':' + x.p.title + ':' + x.p.body).sort();
  ok(m.join(' | ') === 'artem:Nachricht von Jimmy:Halle ist morgen zu. | artem:Nachricht von Udo:Hast du Hütchen? | jimmy:Nachricht von Artem:Ok', 'messages: to all / to one, not your own, not old: ' + m.join(' | '));
  ok(T(c).find(x => x.p.tag === 'msg-msg_1').p.url === 'https://fc-frohlinde.github.io/?go=msg&gid=msg_1', 'link opens the message');
  c = await run(db, at(21, 12, 22));
  ok(!T(c).filter(x => /^msg/.test(x.p.tag)).length, 'once');
  c = await run(db, at(22, 8, 7));
  ok(!T(c).filter(x => /^msg/.test(x.p.tag)).length, 'not again the next day');
}
// ── the machinery ──
{
  const { db } = world(W => { W.meta = { t: at(18, 6, 3), day: 20261018 }; W.status = { t: at(21, 10, 7), day: 20261021, sent: 2 }; });
  const c = await run(db, at(21, 13, 22));
  const t = T(c).filter(x => /^tech/.test(x.p.tag)).map(x => x.to + ':' + x.p.title).sort();
  ok(t.join(' | ') === 'artem:Erinnerungen hatten Pause | artem:Sicherung läuft nicht | jimmy:Erinnerungen hatten Pause | jimmy:Sicherung läuft nicht', 'backup 3 days old, rounds paused 3 h: ' + t.join(' | '));
  ok(T(c).find(x => x.p.tag === 'tech-safe').p.body === 'Die letzte geschützte Tageskopie ist 3 Tage alt. Auf GitHub unter Actions → Sicherung nachsehen.', 'backup text');
  ok(T(c).find(x => x.p.tag === 'tech-safe').p.url === 'https://fc-frohlinde.github.io/?go=backup', 'link opens the backups');
  const c2 = await run(db, at(21, 13, 37));
  ok(!T(c2).filter(x => /^tech/.test(x.p.tag)).length, 'once a day');
}
{
  const { db } = world(W => { W.meta = { t: at(21, 8, 10) }; W.status = { t: at(21, 13, 7), day: 20261021 }; });
  const c = await run(db, at(21, 13, 22));
  ok(!T(c).filter(x => /^tech/.test(x.p.tag)).length, 'all well: nothing');
}
// ── who gets nothing ──
{
  const { db } = world(W => { W.players[1].birthdate = '2008-10-21'; W.meta = { t: 1 }; });
  const c = await run(db, at(21, 9, 7));
  ok(!/mallory|udo|fake|testi|max/.test(who(c)), 'not a trainer, another team, a misplaced record, a test device, a player: ' + who(c));
}
// ── reading: once the morning is done, a quiet day reads no players ──
{
  const { db } = world();
  await run(db, at(21, 9, 7));
  const reads = []; const g = db.get; db.get = async p => { reads.push(p); return g(p); };
  await run(db, at(21, 11, 7));
  ok(!reads.some(p => p.endsWith('/players')), 'nothing due: players not read (' + reads.filter(p => p.startsWith('fcf_data')).join(', ') + ')');
}
console.log(fails ? fails + ' FAILED' : 'all passed');
