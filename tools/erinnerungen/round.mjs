// Flutlicht · Erinnerungen — one round: read, decide, send, record.
//
//   fcf_push/subs/<owner>/<device>  subscriptions (owner: p<hash of token> for
//                                   a player, t<hash of "trainer:"+name> for a
//                                   trainer: test device and/or tp:1 = his own
//                                   notifications, see trainer.mjs)
//   fcf_push/sent/<YYYYMMDD>/<kind>-<key>/<owner>   what went out that day
//                                   (owner "_": a team was looked at, see chk-)
//   fcf_push/tsnap/<team__season>   answers as of the last round, for
//                                   cancellations shortly before the start
//   fcf_push/status                 last round, for the trainers' panel
//   fcf_push/pub                    public VAPID key, read by the app
//   fcf_data/db/<team>__news        a notice from the trainers to the team
//                                   ({t, title, body}), sent once to everyone
//   fcf_push/sq/<block>/<match>/<owner>  what a player was last told about the
//                                   squad of a match ('in|HH:MM|where', 'out');
//                                   _d = day of the match, gone two days after
//   fcf_push_keys/vapid             key pair — no rule grants clients access
//
// db: {get(path), set(path,v), remove(path)}; push: web-push or a stand-in.
import { decode, pathKey, berlin, plan, anyDue, quiet, addDays, newsFresh, planNews, squadPending, planSquad } from './lib.mjs';
import { trainerOwner, allowed, kindsOf, needsPlayers, birthdays, rollCall, cancellations, lineup,
  messages, machinery, BDAY_DAY, BDAY_EVE, ATT_FROM } from './trainer.mjs';

export async function round({ db, push, ts = Date.now(), log = console.log, dry = false }) {
  const now = berlin(ts);
  let sent = 0, errors = 0, gone = 0, nDev = 0;
  try {
    const prev = (await db.get('fcf_push/status')) || {};
    // Keys: made once, kept where only this job can read them
    let keys = await db.get('fcf_push_keys/vapid');
    if (!keys || !keys.publicKey || !keys.privateKey) {
      keys = push.generateVAPIDKeys();
      await db.set('fcf_push_keys/vapid', keys);
      log('Neue VAPID-Schlüssel angelegt');
    }
    if (await db.get('fcf_push/pub') !== keys.publicKey) await db.set('fcf_push/pub', keys.publicKey);
    push.setVapidDetails('https://fc-frohlinde.github.io', keys.publicKey, keys.privateKey);

    const subs = (await db.get('fcf_push/subs')) || {};
    nDev = Object.values(subs).reduce((a, o) => a + Object.keys(o || {}).length, 0);

    // One read per team and kind of data, whoever needs it
    const cache = new Map();
    const load = async (bk, what) => {
      const id = bk + '/' + what;
      if (!cache.has(id)) cache.set(id, decode(await db.get(`fcf_data/db/${pathKey(bk)}/${what}`)) || []);
      return cache.get(id);
    };
    let sentToday = null, sentYest = null;
    const today = async () => (sentToday = sentToday || (await db.get(`fcf_push/sent/${now.day}`)) || {});
    const yesterday = async () => (sentYest = sentYest || (await db.get(`fcf_push/sent/${addDays(now.day, -1)}`)) || {});
    // Notices from the trainers, one read per team
    const newsOf = new Map();
    const teamNews = async team => {
      if (!newsOf.has(team)) newsOf.set(team, decode(await db.get(`fcf_data/db/${pathKey(team + '__news')}`)) || null);
      return newsOf.get(team);
    };

    // To every device of an owner (or one of them); dead devices are removed
    async function deliver(owner, payload, ttl, only) {
      const devs = subs[owner] || {};
      let ok = 0;
      for (const [id, d] of Object.entries(devs)) {
        if (!d || !d.e || !d.k || (only && id !== only)) continue;
        if (dry) { log('[dry]', owner.slice(0, 9), id, payload.title); ok++; continue; }
        try {
          await push.sendNotification({ endpoint: d.e, keys: d.k }, JSON.stringify(payload), { TTL: ttl, urgency: 'normal' });
          ok++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await db.remove(`fcf_push/subs/${owner}/${id}`); delete devs[id]; gone++;
          } else { errors++; log('Fehler', owner.slice(0, 9), id, e.statusCode || '', String(e.body || e.message || '').slice(0, 200)); }
        }
      }
      return ok;
    }

    // Trainer test devices: one test notification per request, any time of day
    for (const [owner, devs] of Object.entries(subs)) {
      if (!owner.startsWith('t')) continue;
      for (const [id, d] of Object.entries(devs || {})) {
        if (!d || !d.test || (d.testSent && d.testSent >= d.test)) continue;
        const n = await deliver(owner, { title: 'Test: Erinnerungen funktionieren ✓',
          body: 'So kommen die Erinnerungen bei den Spielern an.', url: 'https://fc-frohlinde.github.io/', tag: 'test' }, 3600, id);
        if (n) { if (!dry) await db.set(`fcf_push/subs/${owner}/${id}/testSent`, ts); sent += n; log('Test an', d.trainer || owner.slice(0, 9)); }
      }
    }

    // Player reminders, block by block (team + season of the subscriptions)
    const blocks = new Map();
    for (const [owner, devs] of Object.entries(subs)) {
      if (!owner.startsWith('p')) continue;
      for (const d of Object.values(devs || {}))
        if (d && d.team && d.season) blocks.set(d.team + '__' + d.season, { team: d.team, season: d.season });
    }
    const owners = new Set(Object.keys(subs).filter(o => o.startsWith('p')));
    if (!quiet(now) && owners.size) {
      const configs = (await db.get('fcf_push/config')) || {};
      for (const [bk, { team, season }] of blocks) {
        const base = `fcf_data/db/${pathKey(bk)}`;
        const cfg = configs[pathKey(team)] || {};
        const sessions = await load(bk, 'sessions');
        const news = await teamNews(team);
        const hasNews = newsFresh(news, now);
        const hasSquad = squadPending(sessions, season, now);
        if (!hasNews && !hasSquad && !anyDue(sessions, season, now, cfg)) continue;          // most rounds end here
        const players = await load(bk, 'players');
        const sentT = await today();
        const todo = plan({ sessions, players, season, team, now, cfg, owners, sent: sentT });
        if (hasNews) todo.push(...planNews({ news, players, now, owners, log: sentT, logY: await yesterday() }));
        const sqPath = `fcf_push/sq/${pathKey(bk)}`;
        if (hasSquad) todo.push(...planSquad({ sessions, players, season, now, owners, told: (await db.get(sqPath)) || {} }));
        for (const t of todo) {
          const n = await deliver(t.owner, t.payload, t.ttl);
          if (n) {
            sent += n;
            (sentT[t.kind + '-' + t.key] = sentT[t.kind + '-' + t.key] || {})[t.owner] = ts;
            if (!dry) await db.set(`fcf_push/sent/${now.day}/${t.kind}-${t.key}/${t.owner}`, ts);
            if (t.kind === 'squad' && !dry) { await db.set(`${sqPath}/${t.key}/${t.owner}`, t.state); await db.set(`${sqPath}/${t.key}/_d`, t.day); }
            log(t.kind, t.key, t.owner.slice(0, 9), n + ' Gerät(e)');
          }
          // No device left: the bell in his record goes too
          if (!Object.keys(subs[t.owner] || {}).length && !dry) {
            await db.set(`${base}/players/v/${t.pi}/push`, null);
            delete subs[t.owner]; owners.delete(t.owner);
          }
        }
      }
    }

    // Trainers' own notifications (trainer.mjs)
    const recips = [];
    for (const [owner, devs] of Object.entries(subs)) {
      if (!owner.startsWith('t')) continue;
      const d = Object.values(devs || {}).filter(x => x && x.tp && x.trainer && x.team && x.season).sort((a, z) => (z.t || 0) - (a.t || 0))[0];
      if (d && trainerOwner(d.trainer) === owner) recips.push({ owner, name: d.trainer, team: d.team, season: d.season });
    }
    if (!quiet(now) && recips.length) {
      const trainers = decode(await db.get('fcf_data/trainers')) || [];
      const rs = [];
      for (const r of recips) {
        if (!allowed(r.name, r.team, trainers)) { log('Kein Trainer der Mannschaft', r.team + ':', r.name); continue; }
        r.kinds = kindsOf(decode(await db.get(`fcf_data/userAutomation/${pathKey(r.name)}/push`)));
        rs.push(r);
      }
      const sentT = await today();
      let sentY = null;
      const was = (log2, kind, key, owner) => !!(log2 && log2[kind + '-' + key] && log2[kind + '-' + key][owner]);
      const note = async (kind, key, owner) => {
        (sentT[kind + '-' + key] = sentT[kind + '-' + key] || {})[owner] = ts;
        if (!dry) await db.set(`fcf_push/sent/${now.day}/${kind}-${key}/${owner}`, ts);
      };
      const send = async (r, kind, it) => {
        if (was(sentT, kind, it.key, r.owner) || (kind === 'msg' && was(sentY, kind, it.key, r.owner))) return;
        const n = await deliver(r.owner, { title: it.title, body: it.body, url: it.url, tag: kind + '-' + it.key }, it.ttl);
        if (n) { sent += n; await note(kind, it.key, r.owner); log('Trainer', kind, it.key, r.name, n + ' Gerät(e)'); }
      };
      // per team
      const byBlock = new Map();
      for (const r of rs) { const bk = r.team + '__' + r.season; if (!byBlock.has(bk)) byBlock.set(bk, []); byBlock.get(bk).push(r); }
      for (const [bk, group] of byBlock) {
        const b = { team: group[0].team, season: group[0].season, sessions: await load(bk, 'sessions') };
        const any = {}; for (const r of group) for (const k of Object.keys(r.kinds)) any[k] = any[k] || r.kinds[k];
        const chk = k => k + '-' + pathKey(bk);
        const done = k => was(sentT, 'chk', chk(k), '_');
        if (!needsPlayers(b, now, any, done)) continue;
        b.players = await load(bk, 'players');
        const to = async (kind, it) => { for (const r of group) if (r.kinds[kind]) await send(r, kind, it); };
        if (any.bday) for (const eve of [false, true]) {
          const mk = eve ? 'bdaychk-e' : 'bdaychk-d';
          if (now.min < (eve ? BDAY_EVE : BDAY_DAY) || done(mk)) continue;
          const it = birthdays(b, now, eve);
          if (it) await to('bday', it);
          await note('chk', chk(mk), '_');
        }
        if (any.att && now.min >= ATT_FROM && !done('attchk')) {
          for (const it of rollCall(b, now)) await to('att', it);
          await note('chk', chk('attchk'), '_');
        }
        if (any.late) {
          const path = `fcf_push/tsnap/${pathKey(bk)}`;
          const { items, snap } = cancellations(b, now, (await db.get(path)) || {});
          for (const it of items) await to('late', it);
          if (!dry) await db.set(path, Object.keys(snap).length ? snap : null);
        }
        if (any.lineup) for (const it of lineup(b, now)) {
          if (done('lineup-' + it.key)) continue;
          await to('lineup', it);
          await note('chk', chk('lineup-' + it.key), '_');
        }
      }
      // for everyone: messages between trainers, the machinery
      if (rs.some(r => r.kinds.msg)) {
        const list = decode(await db.get('fcf_data/messages')) || [];
        sentY = (await db.get(`fcf_push/sent/${addDays(now.day, -1)}`)) || {};
        for (const r of rs) if (r.kinds.msg) for (const it of messages(list, now, r.name)) await send(r, 'msg', it);
      }
      if (rs.some(r => r.kinds.tech)) {
        const items = machinery({ safe: await db.get('__backups_meta/safe'), prev, now });
        for (const r of rs) if (r.kinds.tech) for (const it of items) await send(r, 'tech', it);
      }
    }

    // Housekeeping: the sent log keeps a week; what players were told about a
    // squad goes two days after the match (once a day is enough)
    const days = Object.keys((await db.get('fcf_push/sent')) || {});
    for (const d of days) if (+d < addDays(now.day, -7) && !dry) await db.remove('fcf_push/sent/' + d);
    if (prev.day !== now.day && !dry) {
      const sq = (await db.get('fcf_push/sq')) || {};
      for (const [b, ms] of Object.entries(sq)) for (const [m, o] of Object.entries(ms || {}))
        if (!o || !o._d || o._d < addDays(now.day, -2)) await db.remove(`fcf_push/sq/${b}/${m}`);
    }

    if (!dry) await db.set('fcf_push/status', {
      t: ts, day: now.day, sent: (prev.day === now.day ? (prev.sent || 0) : 0) + sent,
      err: errors, gone, devices: nDev, v: 1 });
    log(`Runde fertig: ${sent} gesendet, ${errors} Fehler, ${gone} abgemeldet, ${nDev} Geräte`);
    return { sent, errors, gone, devices: nDev };
  } catch (e) {
    log('Runde abgebrochen:', e && e.stack || e);
    try { const prev = (await db.get('fcf_push/status')) || {}; await db.set('fcf_push/status', { ...prev, t: ts, fail: String(e.message || e).slice(0, 200) }); } catch (_) {}
    throw e;
  }
}
