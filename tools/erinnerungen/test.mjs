// Erinnerungen job: rounds against an in-memory database. node test_round.mjs
import { round } from './round.mjs';
import { decode, berlin, ownerOf, plan, sortKey } from './lib.mjs';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };

// The app's storage format: arrays tagged, Firebase turns sparse ones into objects
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
function data() {
  const sess = [];
  for (let x = new Date(2026, 7, 4); x <= new Date(2026, 10, 10); x.setDate(x.getDate() + 1)) {
    const dw = x.getDay();
    if (dw === 2 || dw === 4) sess.push({ date: fmt(x), type: 'training', time: '18:30', duration: 90 });
    if (dw === 0) sess.push({ date: fmt(x), type: 'match', time: '13:00', duration: 90, label: 'SV Brackel' });
  }
  const names = ['Max Müller', 'Ali Kaya', 'Tom Berg', 'Jonas Weber', 'Luca Rossi', 'Finn Schulz', 'Noah Becker'];
  const players = names.map((n, i) => ({ name: n, nr: i + 1, confirmToken: 'tok' + i, s: sess.map(() => 3), rpe: sess.map(() => null) }));
  return { sess, players };
}
function makeDb(init) {
  const root = JSON.parse(JSON.stringify(init));
  const walk = p => p.split('/').filter(Boolean);
  const get = p => { let o = root; for (const k of walk(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } if (o === undefined || (o && typeof o === 'object' && !Object.keys(o).length)) return null; return JSON.parse(JSON.stringify(o)); };
  const set = (p, v) => { const ks = walk(p); let o = root; ks.slice(0, -1).forEach(k => { o = o[k] = (o[k] && typeof o[k] === 'object') ? o[k] : {}; }); if (v === null || v === undefined) delete o[ks.at(-1)]; else o[ks.at(-1)] = JSON.parse(JSON.stringify(v)); };
  return { root, get: async p => get(p), set: async (p, v) => set(p, v), remove: async p => set(p, null) };
}
function makePush() {
  const calls = [];
  return { calls, generateVAPIDKeys: () => ({ publicKey: 'PUB' + calls.length, privateKey: 'PRIV' }), setVapidDetails(s, pub, priv) { this.v = { s, pub, priv }; },
    async sendNotification(sub, payload, opt) {
      if (/dead/.test(sub.endpoint)) { const e = new Error('gone'); e.statusCode = 410; throw e; }
      calls.push({ ep: sub.endpoint, p: JSON.parse(payload), opt });
    } };
}
const dev = (ep, extra) => Object.assign({ e: 'https://push.example/' + ep, k: { p256dh: 'x', auth: 'y' }, t: 1, team: 'U19', season: '2026/27' }, extra || {});
const q = () => {};

// ── basics ──
ok(JSON.stringify(decode({ __arr: 1, v: { 5: 8 } })) === '[null,null,null,null,null,8]', 'decode keeps holes');
ok(JSON.stringify(decode({ a__SL__b: { __arr: 1, v: [1, null] } })) === '{"a/b":[1,null]}', 'decode keys and arrays');
const s1 = berlin(Date.UTC(2026, 9, 20, 18, 25)), w1 = berlin(Date.UTC(2026, 10, 10, 19, 25));
ok(s1.day === 20261020 && s1.min === 20 * 60 + 25, 'Berlin summer time ' + JSON.stringify(s1));
ok(w1.day === 20261110 && w1.min === 20 * 60 + 25, 'Berlin winter time ' + JSON.stringify(w1));
ok(sortKey('Di 20.10', '2026/27') === 20261020 && sortKey('Mo 04.01', '2026/27') === 20270104, 'season years');

// ── a training on Tue 20.10, 18:30–20:00 ──
function world() {
  const { sess, players } = data();
  const si = sess.findIndex(s => s.date === 'Di 20.10');
  players.forEach(p => { p.s[si] = 4; });
  players[1].rpe[si] = 6;                                            // rated
  players[2].rpeMeta = { 'k1020-1830t': { s: 'p', t: 1, nd: 1 } };   // "nicht dabei"
  players[5].s[si] = 2;                                              // excused
  players[6].joinDate = '2026-10-21';                                // joins later
  players.forEach(p => { p.push = { t: 1 }; });
  const subs = {
    [ownerOf('tok0')]: { a: dev('max-phone'), b: dev('max-tablet') },
    [ownerOf('tok1')]: { a: dev('ali') }, [ownerOf('tok2')]: { a: dev('tom') },
    [ownerOf('tok3')]: { a: dev('dead-jonas') },
    [ownerOf('tok5')]: { a: dev('finn') }, [ownerOf('tok6')]: { a: dev('noah') },
    tTRAINER0000000000000000: { x: dev('artem', { test: 5, trainer: 'Artem' }) },
  };
  const db = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) } } }, fcf_push: { subs } });
  return { db, si, sess };
}
{
  const { db, si } = world(); const push = makePush();
  const r0 = await round({ db, push, ts: Date.UTC(2026, 9, 20, 18, 15), log: q });     // 20:15 — too early
  ok(r0.sent === 1 && push.calls.length === 1 && push.calls[0].p.tag === 'test', 'too early for the rating; trainer test goes out at once');
  ok((await db.get('fcf_push/pub')) === 'PUB0' && (await db.get('fcf_push_keys/vapid')).privateKey === 'PRIV', 'keys made, public key published');
  push.calls.length = 0;
  const r1 = await round({ db, push, ts: Date.UTC(2026, 9, 20, 18, 25), log: q });     // 20:25
  const to = push.calls.map(c => c.ep.replace('https://push.example/', '')).sort().join(',');
  ok(to === 'max-phone,max-tablet', 'rating reminder only to Max (both devices): ' + to);
  const c = push.calls[0];
  ok(c && c.p.title === 'Wie anstrengend war’s heute?' && /^Training 18:30 – tipp kurz/.test(c.p.body), 'text: ' + (c && c.p.body));
  ok(c && c.p.url === 'https://fc-frohlinde.github.io/?p=tok0&do=rpe&s=' + si, 'link opens his rating: ' + (c && c.p.url));
  ok(c && c.opt.TTL === (24 * 60 - (20 * 60 + 25)) * 60, 'expires at midnight: ' + (c && c.opt.TTL));
  ok(!(await db.get('fcf_push/subs/' + ownerOf('tok3'))), 'dead device removed (410)');
  ok((await db.get('fcf_data/db/U19__2026__SL__27/players/v/3/push')) === null, 'his bell cleared');
  ok(!!(await db.get('fcf_push/sent/20261020/rpe-k1020-1830t/' + ownerOf('tok0'))), 'sent log');
  ok((await db.get('fcf_push/subs/tTRAINER0000000000000000/x')).testSent > 0, 'test marked as sent');
  const st = await db.get('fcf_push/status');
  ok(st.sent === 3 && st.gone === 1 && st.day === 20261020, 'status: ' + JSON.stringify(st));
  push.calls.length = 0;
  await round({ db, push, ts: Date.UTC(2026, 9, 20, 18, 40), log: q });
  ok(push.calls.length === 0, 'no second reminder, no second test');
  ok((await db.get('fcf_push/status')).sent === 3, 'day total kept');
}
{ // quiet hours
  const { db } = world(); const push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 20, 20, 40), log: q });                // 22:40
  ok(push.calls.length === 1 && push.calls[0].p.tag === 'test', 'after 22:30 only the requested test');
}
{ // trainer switched the kind off
  const { db } = world(); const push = makePush();
  await db.set('fcf_push/config/U19', { rpe: false });
  await round({ db, push, ts: Date.UTC(2026, 9, 20, 18, 25), log: q });
  ok(push.calls.filter(c => c.p.tag !== 'test').length === 0, 'Belastung off: nothing');
}
// ── the vote, Monday after Sunday's match ──
{
  const { sess, players } = data();
  const mi = sess.findIndex(s => s.date === 'So 18.10');
  players[0].rpe[mi] = 7; players[1].rpe[mi] = 6; players[1].mvpV = { 'k1018-1300m': 1 };
  players.forEach(p => { p.s[mi] = 1; });
  const subs = { [ownerOf('tok0')]: { a: dev('max') }, [ownerOf('tok1')]: { a: dev('ali') }, [ownerOf('tok2')]: { a: dev('tom') } };
  const mk = () => makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) } } }, fcf_push: { subs } });
  let db = mk(), push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 19, 14, 55), log: q });                // 16:55
  ok(push.calls.length === 0, 'vote: not before 17:00');
  await round({ db, push, ts: Date.UTC(2026, 9, 19, 15, 5), log: q });                 // 17:05
  ok(push.calls.length === 1 && push.calls[0].ep.endsWith('/max') && push.calls[0].p.body === 'Gegen SV Brackel fehlt noch deine Stimme – bis heute 24 Uhr.'
    && push.calls[0].p.url.endsWith('&do=vote&s=' + mi), 'vote: only who rated and has not voted: ' + JSON.stringify(push.calls.map(c => c.ep + ' ' + c.p.url)));
}
// ── the answer, the evening before Thursday ──
{
  const { sess, players } = data();
  const ti = sess.findIndex(s => s.date === 'Do 22.10');
  players[1].s[ti] = 4; players[2].s[ti] = 2;
  const subs = { [ownerOf('tok0')]: { a: dev('max') }, [ownerOf('tok1')]: { a: dev('ali') }, [ownerOf('tok2')]: { a: dev('tom') } };
  const db = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) } } }, fcf_push: { subs } });
  const push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 21, 16, 5), log: q });                 // Wed 18:05
  ok(push.calls.length === 1 && push.calls[0].ep.endsWith('/max') && push.calls[0].p.title === 'Morgen Training, 18:30'
    && push.calls[0].p.url.endsWith('?p=tok0&do=week'), 'Zusage: only who has not answered: ' + JSON.stringify(push.calls.map(c => c.p.title)));
  sess[ti].rsvpUntil = Date.UTC(2026, 9, 21, 15, 0);
  const db2 = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) } } }, fcf_push: { subs } });
  const push2 = makePush();
  await round({ db: db2, push: push2, ts: Date.UTC(2026, 9, 21, 16, 5), log: q });
  ok(push2.calls.length === 0, 'Zusage: not after the deadline');
}
// ── no subscriptions: no player data read ──
{
  const { sess, players } = data();
  const db = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) } } } });
  const reads = []; const g = db.get; db.get = async p => { reads.push(p); return g(p); };
  await round({ db, push: makePush(), ts: Date.UTC(2026, 9, 20, 18, 25), log: q });
  ok(!reads.some(p => p.startsWith('fcf_data')), 'nobody subscribed: data untouched ' + reads.join(','));
}
// ── a quiet round: sessions only ──
{
  const { db } = world();
  const reads = []; const g = db.get; db.get = async p => { reads.push(p); return g(p); };
  await round({ db, push: makePush(), ts: Date.UTC(2026, 9, 20, 9, 0), log: q });      // 11:00, nothing due
  ok(reads.some(p => p.endsWith('/sessions')) && !reads.some(p => p.endsWith('/players')), 'nothing due: players not read');
}
// ── "Erinnern" by a trainer ──
{
  const { sess, players } = data();
  const ti = sess.findIndex(s => s.date === 'Do 22.10');
  players[1].s[ti] = 4; players[2].s[ti] = 0;
  const subs = { [ownerOf('tok0')]: { a: dev('max') }, [ownerOf('tok1')]: { a: dev('ali') }, [ownerOf('tok2')]: { a: dev('tom') }, [ownerOf('tok3')]: { a: dev('jonas') } };
  const press = Date.UTC(2026, 9, 21, 9, 0);                                         // Wed 11:00
  sess[ti].remind = { t: press, by: 'Artem' };
  const db = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) } } }, fcf_push: { subs, config: { U19: { rsvp: false } } } });
  let push = makePush();
  await round({ db, push, ts: press + 7 * 60e3, log: q });
  const to = push.calls.map(c => c.ep.replace('https://push.example/', '')).sort().join(',');
  ok(to === 'jonas,max' && push.calls[0].p.title === 'Training morgen, 18:30' && push.calls[0].p.body === 'Kommst du? Sag kurz zu oder ab.' && push.calls[0].p.url.endsWith('&do=week'),
    'Erinnern: only who has not answered, even with the automatic reminder off: ' + to + ' ' + (push.calls[0] || { p: {} }).p.title);
  push = makePush();
  await round({ db, push, ts: press + 22 * 60e3, log: q });
  ok(push.calls.length === 0, 'Erinnern: once per press');
  const s2 = JSON.parse(JSON.stringify(sess)); s2[ti].remind = { t: press + 3600e3, by: 'Artem' };
  await db.set('fcf_data/db/U19__2026__SL__27/sessions', enc(s2));
  push = makePush();
  await round({ db, push, ts: press + 3600e3 + 7 * 60e3, log: q });
  ok(push.calls.length === 2, 'pressed again later: again (' + push.calls.length + ')');
  push = makePush();
  await round({ db, push, ts: press + 13 * 3600e3, log: q });
  ok(push.calls.length === 0, 'old press (13 h): nothing');
  const s3 = JSON.parse(JSON.stringify(sess)); s3[ti].remind = { t: Date.UTC(2026, 9, 21, 20, 50), by: 'Artem' };   // 22:50
  const db3 = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(s3), players: enc(players) } } }, fcf_push: { subs } });
  push = makePush();
  await round({ db: db3, push, ts: Date.UTC(2026, 9, 21, 21, 7), log: q });
  ok(push.calls.length === 0, 'pressed at night: not at night');
  push = makePush();
  await round({ db: db3, push, ts: Date.UTC(2026, 9, 22, 6, 7), log: q });
  ok(push.calls.length === 2 && push.calls[0].p.title === 'Training heute, 18:30', 'pressed at night: the next morning, "heute": ' + push.calls.map(c => c.p.title).join());
}
// ── a notice from the trainers ("Neue Trainingszeiten", "Trainingspause") ──
{
  const { sess, players } = data();
  const subs = { [ownerOf('tok0')]: { a: dev('max'), b: dev('max2') }, [ownerOf('tok1')]: { a: dev('ali') }, [ownerOf('tok5')]: { a: dev('finn') } };
  const at = Date.UTC(2026, 9, 21, 8, 0);                                             // Wed 10:00
  const news = { t: at, title: 'Neue Trainingszeiten', body: 'Ab Mo 26.10. trainieren wir Mo und Mi um 19:00 Uhr.', by: 'Artem' };
  const db = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) }, U19__news: news } }, fcf_push: { subs, config: { U19: { rsvp: false, rpe: false, vote: false } } } });
  let push = makePush();
  await round({ db, push, ts: at + 7 * 60e3, log: q });
  const to = push.calls.map(c => c.ep.replace('https://push.example/', '')).sort().join(',');
  ok(to === 'ali,finn,max,max2' && push.calls[0].p.title === 'Neue Trainingszeiten' && /Mo und Mi um 19:00/.test(push.calls[0].p.body)
    && /\?p=tok\d$/.test(push.calls[0].p.url), 'notice: to every subscribed player and device, whatever the reminders are set to: ' + to + ' ' + (push.calls[0] || { p: {} }).p.url);
  push = makePush();
  await round({ db, push, ts: at + 22 * 60e3, log: q });
  ok(push.calls.length === 0, 'notice: once');
  push = makePush();
  await round({ db, push, ts: at + 23 * 3600e3, log: q });                               // next morning 9:00
  ok(push.calls.length === 0, 'notice: not again the next day (yesterday\'s log)');
  // written at night: in the morning
  const n2 = { t: Date.UTC(2026, 9, 21, 20, 50), title: 'Trainingspause', body: 'Vom Mo 26.10. bis So 1.11. ist kein Training.' };
  const db2 = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) }, U19__news: n2 } }, fcf_push: { subs } });
  push = makePush();
  await round({ db: db2, push, ts: Date.UTC(2026, 9, 21, 21, 7), log: q });
  ok(push.calls.length === 0, 'notice at night: not at night');
  push = makePush();
  await round({ db: db2, push, ts: Date.UTC(2026, 9, 22, 6, 7), log: q });
  ok(push.calls.length === 4 && push.calls.every(c => c.p.title === 'Trainingspause'), 'notice at night: the next morning (' + push.calls.length + ')');
  // too old
  const db3 = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) }, U19__news: news } }, fcf_push: { subs } });
  push = makePush();
  await round({ db: db3, push, ts: at + 25 * 3600e3, log: q });
  ok(!push.calls.some(c => c.p.title === 'Neue Trainingszeiten'), 'notice older than a day: not sent');
  // another team's notice: not to these players
  const db4 = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) }, U17__news: news } }, fcf_push: { subs } });
  push = makePush();
  await round({ db: db4, push, ts: at + 7 * 60e3, log: q });
  ok(push.calls.length === 0, 'another team\'s notice: nothing');
}
console.log(fails ? fails + ' FAILED' : 'all passed');
