// Flutlicht · Erinnerungen — one round: read, decide, send, record.
//
//   fcf_push/subs/<owner>/<device>  subscriptions (owner: p<hash of token>,
//                                   or t<hash> for a trainer's test device)
//   fcf_push/sent/<YYYYMMDD>/<kind>-<session>/<owner>   what went out that day
//   fcf_push/status                 last round, for the trainers' panel
//   fcf_push/pub                    public VAPID key, read by the app
//   fcf_push_keys/vapid             key pair — no rule grants clients access
//
// db: {get(path), set(path,v), remove(path)}; push: web-push or a stand-in.
import { decode, pathKey, berlin, plan, anyDue, quiet, addDays } from './lib.mjs';

export async function round({ db, push, ts = Date.now(), log = console.log, dry = false }) {
  const now = berlin(ts);
  let sent = 0, errors = 0, gone = 0, nDev = 0;
  try {
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
    for (const devs of Object.values(subs)) for (const d of Object.values(devs || {}))
      if (d && d.team && d.season) blocks.set(d.team + '__' + d.season, { team: d.team, season: d.season });
    const owners = new Set(Object.keys(subs).filter(o => o.startsWith('p')));
    if (!quiet(now) && owners.size) {
      const configs = (await db.get('fcf_push/config')) || {};
      const sentToday = (await db.get(`fcf_push/sent/${now.day}`)) || {};
      for (const [bk, { team, season }] of blocks) {
        const base = `fcf_data/db/${pathKey(bk)}`;
        const cfg = configs[pathKey(team)] || {};
        const sessions = decode(await db.get(base + '/sessions')) || [];
        if (!anyDue(sessions, season, now, cfg)) continue;          // most rounds end here
        const players = decode(await db.get(base + '/players')) || [];
        for (const t of plan({ sessions, players, season, team, now, cfg, owners, sent: sentToday })) {
          const n = await deliver(t.owner, t.payload, t.ttl);
          if (n) {
            sent += n;
            if (!dry) await db.set(`fcf_push/sent/${now.day}/${t.kind}-${t.key}/${t.owner}`, ts);
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

    // Housekeeping: the sent log keeps a week
    const days = Object.keys((await db.get('fcf_push/sent')) || {});
    for (const d of days) if (+d < addDays(now.day, -7) && !dry) await db.remove('fcf_push/sent/' + d);

    const prev = (await db.get('fcf_push/status')) || {};
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
