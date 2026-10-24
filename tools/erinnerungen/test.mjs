// Erinnerungen job: rounds against an in-memory database. node test_round.mjs
import { round } from './round.mjs';
import { decode, berlin, ownerOf, plan, sortKey } from './lib.mjs';
import { buildIcs, icsHash, publishCalendars, seasonOf, slug } from './kalender.mjs';

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
// ── not in the squad (1.2.18): no load question, no vote ──
{
  const { sess, players } = data();
  const mi = sess.findIndex(s => s.date === 'So 18.10');
  sess[mi].squad = { p: ['Max Müller', 'Tom Berg'], out: ['Ali Kaya'], meet: '11:30', where: '', t: Date.UTC(2026, 9, 16, 12, 0), by: 'Artem' };
  // Max picked (Zusage), Ali confirmed but not picked, Tom picked and present,
  // Jonas already N, Luca not picked but marked present (came anyway)
  [4, 4, 1, 5, 1].forEach((v, i) => { players[i].s[mi] = v; });
  const subs = {}; [0, 1, 2, 3, 4].forEach(i => { subs[ownerOf('tok' + i)] = { a: dev('d' + i) }; });
  const mk = () => makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) } } }, fcf_push: { subs, config: { U19: { rsvp: false, rpe: true, vote: true } } } });
  let db = mk(), push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 18, 13, 0), log: q });               // So 15:00, match 13:00–14:30
  const got = push.calls.filter(c => /^rpe-/.test(c.p.tag || '')).map(c => c.ep.split('/').pop()).sort().join();
  ok(got === 'd0,d2,d4', 'Belastung: the squad and who came anyway — not Ali (not picked), not Jonas (N): ' + got);
  players[0].rpe[mi] = 7; players[1].rpe[mi] = 5; players[3].rpe[mi] = 4;
  db = mk(); push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 19, 15, 5), log: q });                // Mo 17:05
  const v = push.calls.filter(c => /^vote-/.test(c.p.tag || '')).map(c => c.ep.split('/').pop()).sort().join();
  ok(v === 'd0', 'vote: only who was in it and rated: ' + v);
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
// ── player status (1.2.51): pause, Probetraining, nicht mehr dabei ──
{
  const { sess, players } = data();
  const ti = sess.findIndex(s => s.date === 'Do 22.10');
  players[1].pauses = [{ f: '2026-10-20', t: '' }];          // Ali: pause, open-ended
  players[2].trial = '2026-10-13';                            // Tom: Probetraining
  players[3].gone = '2026-10-01';                             // Jonas: nicht mehr dabei
  players[4].pauses = [{ f: '2026-09-01', t: '2026-09-30' }]; // Luca: pause over
  const subs = {}; [0, 1, 2, 3, 4].forEach(i => { subs[ownerOf('tok' + i)] = { a: dev('d' + i) }; });
  let db = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) } } }, fcf_push: { subs } });
  let push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 21, 16, 5), log: q });                 // Wed 18:05, Thursday open for all
  const to = push.calls.filter(c => /^rsvp-/.test(c.p.tag || '')).map(c => c.ep.split('/').pop()).sort().join();
  ok(to === 'd0,d4', 'status: the answer reminder skips pause, Probetraining and who left: ' + to);
  const at = Date.UTC(2026, 9, 21, 8, 0);
  const news = { t: at, title: 'Trainingspause', body: 'Herbstferien.', by: 'Artem' };
  db = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) }, U19__news: news } }, fcf_push: { subs, config: { U19: { rsvp: false, rpe: false, vote: false } } } });
  push = makePush();
  await round({ db, push, ts: at + 22 * 60e3, log: q });
  const tn = push.calls.map(c => c.ep.split('/').pop()).sort().join();
  ok(tn === 'd0,d1,d2,d4', 'status: news to the team, pause and Probetraining included, not to who left: ' + tn);
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
  ok(push.calls.length === 0, 'notice: not before it is 10 minutes old');
  push = makePush();
  await round({ db, push, ts: at + 22 * 60e3, log: q });
  const to = push.calls.map(c => c.ep.replace('https://push.example/', '')).sort().join(',');
  ok(to === 'ali,finn,max,max2' && push.calls[0].p.title === 'Neue Trainingszeiten' && /Mo und Mi um 19:00/.test(push.calls[0].p.body)
    && /\?p=tok\d$/.test(push.calls[0].p.url), 'notice: to every subscribed player and device, whatever the reminders are set to: ' + to + ' ' + (push.calls[0] || { p: {} }).p.url);
  push = makePush();
  await round({ db, push, ts: at + 37 * 60e3, log: q });
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
  await round({ db: db4, push, ts: at + 22 * 60e3, log: q });
  ok(push.calls.length === 0, 'another team\'s notice: nothing');
  // taken back before it went out
  const db5 = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) }, U19__news: Object.assign({}, news, { off: at + 5 * 60e3 }) } }, fcf_push: { subs } });
  push = makePush();
  await round({ db: db5, push, ts: at + 22 * 60e3, log: q });
  ok(push.calls.length === 0, 'notice taken back: nothing');
}
// ── Spieltag: Kader und Treffpunkt ──
{
  const { sess, players } = data();
  const si = sess.findIndex(s => s.date === 'So 25.10');
  // Max 4 in · Ali 4 out · Tom 3 not picked · Jonas 0 declined (still listed) · Luca 3 picked · Finn 2 · Noah 4 out
  [4, 4, 3, 0, 3, 2, 4].forEach((v, i) => { players[i].s[si] = v; });
  const sq = { p: ['Max Müller', 'Jonas Weber', 'Luca Rossi'], out: ['Ali Kaya', 'Noah Becker'], meet: '11:45', where: 'Parkplatz Sportplatz', t: Date.UTC(2026, 9, 23, 18, 0), by: 'Artem' };
  sess[si].squad = sq;
  const subs = {};
  ['tok0', 'tok1', 'tok2', 'tok3', 'tok4', 'tok6'].forEach(t => { subs[ownerOf(t)] = { a: dev(t) }; });
  const mk = () => makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess), players: enc(players) } } },
    fcf_push: { subs, config: { U19: { rsvp: false, rpe: false, vote: false } } } });
  const db = mk();
  const by = c => c.ep.replace('https://push.example/', '');
  let push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 23, 18, 5), log: q });           // Fr 20:05, 5 minutes after
  ok(push.calls.length === 0, 'squad: not in the first 10 minutes');
  push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 23, 18, 12), log: q });          // Fr 20:12
  const got = Object.fromEntries(push.calls.map(c => [by(c), c.p]));
  ok(Object.keys(got).sort().join() === 'tok0,tok1,tok4,tok6', 'squad: in (Max, Luca) and confirmed-out (Ali, Noah); not Tom (no answer), not Jonas (declined): ' + Object.keys(got).sort().join());
  ok(got.tok0 && got.tok0.title === 'Du bist im Kader für Sonntag' && got.tok0.body === 'Treffpunkt 11:45, Parkplatz Sportplatz. Anstoß 13:00 gegen SV Brackel.', 'squad: in text: ' + JSON.stringify(got.tok0));
  ok(got.tok1 && got.tok1.title === 'Kader für Sonntag steht' && got.tok1.body === 'Diesmal bist du nicht dabei. Nächstes Training Di 27.10, 18:30.', 'squad: out text: ' + JSON.stringify(got.tok1));
  ok(got.tok0 && got.tok0.url === 'https://fc-frohlinde.github.io/?p=tok0&do=week' && got.tok0.tag === 'squad-k1025-1300m', 'squad: link and tag');
  const ttl0 = push.calls.find(c => by(c) === 'tok0').opt.TTL;
  ok(ttl0 === ((2 * 1440 + 13 * 60) - (20 * 60 + 12)) * 60, 'squad: valid until kick-off: ' + ttl0);
  const told = await db.get('fcf_push/sq/U19__2026__SL__27/k1025-1300m');
  ok(told && told[ownerOf('tok0')] === 'in|11:45|Parkplatz Sportplatz' && told[ownerOf('tok1')] === 'out' && told._d === 20261025, 'squad: what each was told is kept: ' + JSON.stringify(told));
  push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 23, 18, 27), log: q });
  ok(push.calls.length === 0, 'squad: once');
  // Changed on Saturday morning: Ali in, Luca out, meeting 11:30
  const sess2 = await db.get('fcf_data/db/U19__2026__SL__27/sessions');
  const s2 = decode(sess2);
  s2[si].squad = Object.assign({}, sq, { p: ['Max Müller', 'Ali Kaya'], out: ['Noah Becker'], meet: '11:30', t: Date.UTC(2026, 9, 24, 7, 0) });
  await db.set('fcf_data/db/U19__2026__SL__27/sessions', enc(s2));
  push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 24, 7, 12), log: q });           // Sa 9:12
  const ch = Object.fromEntries(push.calls.map(c => [by(c), c.p]));
  ok(Object.keys(ch).sort().join() === 'tok0,tok1,tok4', 'squad changed: only those concerned (Noah unchanged): ' + Object.keys(ch).sort().join());
  ok(ch.tok0 && ch.tok0.title === 'Neuer Treffpunkt für morgen' && /^Treffpunkt 11:30,/.test(ch.tok0.body), 'squad changed: new meeting time: ' + JSON.stringify(ch.tok0));
  ok(ch.tok1 && ch.tok1.title === 'Du bist jetzt im Kader für morgen', 'squad changed: now in: ' + JSON.stringify(ch.tok1));
  ok(ch.tok4 && ch.tok4.title === 'Änderung im Kader für morgen' && /^Diesmal bist du doch nicht dabei\./.test(ch.tok4.body), 'squad changed: taken out (no answer, but he had been told he is in): ' + JSON.stringify(ch.tok4));
  // On match day after kick-off: nothing more, whatever changes
  s2[si].squad = Object.assign({}, s2[si].squad, { p: ['Max Müller'], t: Date.UTC(2026, 9, 25, 10, 0) });
  await db.set('fcf_data/db/U19__2026__SL__27/sessions', enc(s2));
  push = makePush();
  await round({ db, push, ts: Date.UTC(2026, 9, 25, 12, 30), log: q });          // So 13:30 (winter time since 3:00)
  ok(push.calls.length === 0, 'squad: after kick-off nothing');
  // Two days later the record is cleared (first round of a new day)
  await db.set('fcf_push/status', { day: 20261027 });
  await round({ db, push, ts: Date.UTC(2026, 9, 28, 6, 7), log: q });            // Mi 8:07
  ok(!(await db.get('fcf_push/sq/U19__2026__SL__27/k1025-1300m')), 'squad record cleared two days after the match');
  // Withdrawn before it went out: nothing; published at night: in the morning
  const sess3 = JSON.parse(JSON.stringify(sess));
  sess3[si].squad = Object.assign({}, sq, { off: Date.UTC(2026, 9, 23, 18, 3) });
  const db3 = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess3), players: enc(players) } } }, fcf_push: { subs, config: { U19: { rsvp: false, rpe: false, vote: false } } } });
  push = makePush();
  await round({ db: db3, push, ts: Date.UTC(2026, 9, 23, 18, 20), log: q });
  ok(push.calls.length === 0, 'squad withdrawn: nothing');
  const sess4 = JSON.parse(JSON.stringify(sess));
  sess4[si].squad = Object.assign({}, sq, { t: Date.UTC(2026, 9, 23, 20, 50) });   // Fr 22:50
  const db4 = makeDb({ fcf_data: { db: { 'U19__2026__SL__27': { sessions: enc(sess4), players: enc(players) } } }, fcf_push: { subs, config: { U19: { rsvp: false, rpe: false, vote: false } } } });
  push = makePush();
  await round({ db: db4, push, ts: Date.UTC(2026, 9, 23, 21, 7), log: q });
  ok(push.calls.length === 0, 'squad at night: not at night');
  push = makePush();
  await round({ db: db4, push, ts: Date.UTC(2026, 9, 24, 6, 7), log: q });       // Sa 8:07
  ok(push.calls.length === 4 && push.calls.some(c => c.p.title === 'Du bist im Kader für morgen'), 'squad at night: the next morning, "für morgen" (' + push.calls.length + ')');
}
// ── calendar feed (kalender.mjs) ──
{
  ok(seasonOf(20261022) === '2026/27' && seasonOf(20270630) === '2026/27' && seasonOf(20270701) === '2027/28', 'calendar: season of a day');
  ok(slug('U19') === 'U19' && slug('U 17/2') === 'U_17_2', 'calendar: team key');
  const now = berlin(Date.UTC(2026, 9, 22, 18, 0));
  const sess = [
    { date: 'So 16.08', type: 'match', time: '13:00', label: 'Alt' },                       // older than 30 days: not in the feed
    { date: 'Di 20.10', type: 'training', time: '18:30', duration: 90, focus: 'Umschalten', location: 'Kunstrasen' },
    { date: 'So 25.10', type: 'match', time: '13:00', label: 'SV Brackel', homeAway: 'away', location: 'Sportpark Brackel',
      squad: { p: ['Max Müller'], out: [], meet: '11:30', where: 'Parkplatz, Frohlinde', t: 1, by: 'Artem' } },
    { date: 'Do 29.10', type: 'training' },                                                   // no time: all day
  ];
  const evs = [{ id: 'cev_1', date: 'Fr 30.10', time: '19:00', name: 'Mannschaftsabend', note: 'Pizzeria', players: [1, 2] }];
  const ics = buildIcs({ team: 'U19', season: '2026/27', sessions: sess, events: evs, now });
  const lines = ics.split('\r\n');
  ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n') && !/[^\r]\n/.test(ics), 'calendar: CRLF lines, begin and end');
  ok(lines.every(l => Buffer.byteLength(l, 'utf8') <= 75), 'calendar: no line over 75 octets');
  ok(ics.includes('X-WR-CALNAME:FC Frohlinde U19') && ics.includes('TZID:Europe/Berlin') && ics.includes('REFRESH-INTERVAL;VALUE=DURATION:PT1H'), 'calendar: name, time zone, refresh');
  ok(!ics.includes('Alt'), 'calendar: older than 30 days left out');
  const unf = ics.replace(/\r\n /g, '');
  ok(unf.includes('SUMMARY:Training · Umschalten') && unf.includes('DTSTART;TZID=Europe/Berlin:20261020T183000') && unf.includes('DTEND;TZID=Europe/Berlin:20261020T200000') && unf.includes('LOCATION:Kunstrasen'), 'calendar: a training');
  ok(unf.includes('SUMMARY:Spiel gegen SV Brackel') && unf.includes('DTSTART;TZID=Europe/Berlin:20261025T130000') && unf.includes('DTEND;TZID=Europe/Berlin:20261025T144500')
    && unf.includes('DESCRIPTION:Auswärtsspiel\\nAnstoß 13:00\\nTreffpunkt 11:30\\, Parkplatz\\, Frohlinde\\nFlutlicht: https://fc-frohlinde.github.io/'), 'calendar: a match with the meeting point, escaped: ' + (unf.match(/DESCRIPTION:Auswärts[^\r]*/) || [''])[0]);
  ok(unf.includes('DTSTART;VALUE=DATE:20261029') && unf.includes('DTEND;VALUE=DATE:20261030'), 'calendar: no time → all day');
  ok(unf.includes('SUMMARY:Mannschaftsabend') && unf.includes('DTSTART;TZID=Europe/Berlin:20261030T190000') && unf.includes('UID:ev-cev_1-U19@fc-frohlinde.github.io'), 'calendar: the team\'s other dates');
  ok(!/Max Müller/.test(ics), 'calendar: no player names');
  const later = buildIcs({ team: 'U19', season: '2026/27', sessions: sess, events: evs, now: berlin(Date.UTC(2026, 9, 22, 19, 0)) });
  ok(icsHash(later) === icsHash(ics) && later !== ics, 'calendar: same dates, same hash (only the time stamp differs)');
  // publishing
  const fx = (responses) => { const calls = []; const f = async (url, o) => { calls.push({ url, method: o.method, body: o.body ? JSON.parse(o.body) : null, auth: o.headers.Authorization });
    const r = responses.shift() || { status: 200, j: {} }; return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.j }; }; f.calls = calls; return f; };
  const mk = () => makeDb({ fcf_data: { teamList: ['U19'], db: { 'U19__2026__SL__27': { sessions: enc(sess) } }, calEvents: { 'U19__2026__SL__27': enc(evs) } } });
  const ld = db => { const c = new Map(); return async (bk, what) => { if (!c.has(bk + what)) c.set(bk + what, decode(await db.get(`fcf_data/db/${bk.replace(/\//g, '__SL__')}/${what}`)) || []); return c.get(bk + what); }; };
  const logs = [], lg = (...a) => logs.push(a.join(' '));
  let db = mk(), f = fx([]);
  let st = await publishCalendars({ db, now, token: '', fetchFn: f, load: ld(db), log: lg });
  ok(st.off === 1 && f.calls.length === 0 && !(await db.get('fcf_cal/U19')), 'calendar: without a token nothing is published');
  f = fx([{ status: 201, j: { id: 'g123secret', owner: { login: 'artem' } } }]);
  st = await publishCalendars({ db, now, token: 'tok', fetchFn: f, load: ld(db), log: lg });
  ok(f.calls.length === 1 && f.calls[0].method === 'POST' && f.calls[0].url === 'https://api.github.com/gists' && f.calls[0].body.public === false && f.calls[0].auth === 'Bearer tok'
    && f.calls[0].body.files['fc-frohlinde-u19.ics'].content.includes('SUMMARY:Spiel gegen SV Brackel'), 'calendar: first time a secret gist is made');
  const pub = await db.get('fcf_cal/U19');
  ok(pub && pub.url === 'https://gist.githubusercontent.com/artem/g123secret/raw/fc-frohlinde-u19.ics' && pub.team === 'U19', 'calendar: the address for the members: ' + JSON.stringify(pub));
  ok((await db.get('fcf_push/cal/U19')).gist === 'g123secret' && st.t === now.ts && st.n === 1, 'calendar: state kept for the job');
  ok(!logs.join('\n').includes('g123secret') && !logs.join('\n').includes('gist.githubusercontent'), 'calendar: the log never shows the address');
  f = fx([]);
  await publishCalendars({ db, now: berlin(Date.UTC(2026, 9, 22, 18, 15)), token: 'tok', fetchFn: f, load: ld(db), log: lg });
  ok(f.calls.length === 0, 'calendar: nothing changed → no call to GitHub');
  const s2 = JSON.parse(JSON.stringify(sess)); s2[1].time = '19:00';
  await db.set('fcf_data/db/U19__2026__SL__27/sessions', enc(s2));
  f = fx([{ status: 200, j: { id: 'g123secret', owner: { login: 'artem' } } }]);
  await publishCalendars({ db, now, token: 'tok', fetchFn: f, load: ld(db), log: lg });
  ok(f.calls.length === 1 && f.calls[0].method === 'PATCH' && f.calls[0].url === 'https://api.github.com/gists/g123secret'
    && f.calls[0].body.files['fc-frohlinde-u19.ics'].content.includes('20261020T190000'), 'calendar: a moved training updates the same gist');
  s2[1].time = '18:00'; await db.set('fcf_data/db/U19__2026__SL__27/sessions', enc(s2));
  f = fx([{ status: 404, j: {} }, { status: 201, j: { id: 'gNEW', owner: { login: 'artem' } } }]);
  await publishCalendars({ db, now, token: 'tok', fetchFn: f, load: ld(db), log: lg });
  ok(f.calls.map(c => c.method).join() === 'PATCH,POST' && (await db.get('fcf_cal/U19')).url.includes('/gNEW/'), 'calendar: gist deleted → a new one, new address');
  s2[1].time = '17:00'; await db.set('fcf_data/db/U19__2026__SL__27/sessions', enc(s2));
  f = fx([{ status: 401, j: { message: 'Bad credentials' } }, { status: 401, j: {} }]);
  st = await publishCalendars({ db, now, token: 'bad', fetchFn: f, load: ld(db), log: lg });
  ok(st.err === 401 && (await db.get('fcf_cal/U19')).url.includes('/gNEW/'), 'calendar: bad token → error noted, the old address stays');
  // inside a round: status.cal
  db = mk(); await db.set('fcf_push/subs', {});
  f = fx([{ status: 201, j: { id: 'gR', owner: { login: 'artem' } } }]);
  await round({ db, push: makePush(), ts: Date.UTC(2026, 9, 22, 18, 0), log: q, cal: { token: 'tok', fetch: f } });
  const rs = await db.get('fcf_push/status');
  ok(rs.cal && rs.cal.n === 1 && rs.cal.t > 0 && !rs.cal.err && (await db.get('fcf_cal/U19')).url.includes('/gR/'), 'calendar: in a round, status.cal: ' + JSON.stringify(rs.cal));
  await round({ db, push: makePush(), ts: Date.UTC(2026, 9, 22, 18, 15), log: q });
  ok((await db.get('fcf_push/status')).cal.off === 1, 'calendar: a round without a token says so');
}
console.log(fails ? fails + ' FAILED' : 'all passed');
