// Flutlicht · Erinnerungen — the players' inbox (1.2.36, Sicherheit Teil 2).
//
//   fcf_in/<pk>/<id> = {a, k, si, v, t, m?}   what a player did, pk = sha256('fcf-pv|'+token).
//                     Merged here (and at once by an open trainer app with an
//                     account) with pvApply — the app's own function, read from
//                     index.html between the PV-APPLY markers, so both apply the
//                     same rules. Merged entries keep m until a newer slice
//                     (fcf_pv/<pk>/t) has them, then they go.
//   fcf_vote/<pk>/<k> = {n, t}   a vote for Spieler des Spiels: counted into
//                     sessions/<si>/mvp/c/<name>, the voter marked in
//                     players/<pi>/mvpV/<k>, the vote itself deleted. Nobody but
//                     this job reads it.
//   fcf_pt/<tk>/mvp/<k> = [names]   the winner(s) once a vote has closed, for
//                     the players' slices (tk = sha256('fcf-pt|'+lk)).
//
// db: {get, update(map), claim(path, t, now) → bool, inc(n) → increment value}
import fs from 'node:fs';
import { decode, pathKey, sha, sortKey, berlin, addDays, metaKey } from './lib.mjs';

export const MVP_MIN_VOTES = 3;      // as in the app
export const MVP_SHOW_DAYS = 7;
export const KEEP_MERGED = 120e3;    // a slice this much newer than the merge has it

export function loadApply(file) {
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf('// ==PV-APPLY-BEGIN=='), b = html.indexOf('// ==PV-APPLY-END==');
  if (a < 0 || b < a) throw new Error('pvApply nicht in ' + file);
  return new Function(html.slice(a, b) + '\nreturn pvApply;')();
}
const dk = k => k.replace(/__SL__/g, '/').replace(/__DOT__/g, '.').replace(/__HASH__/g, '#').replace(/__LB__/g, '[').replace(/__RB__/g, ']');
const ARR = ['s', 'ay', 'excOK', 'physio', 'preconfReason', 'rpe', 'rpeMin'];

// Winners of a closed vote: as mvpResult in the app
export function winners(c) {
  const rows = Object.entries(c || {}).map(([n, v]) => ({ n, v: +v || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const total = rows.reduce((a, b) => a + b.v, 0);
  if (total < MVP_MIN_VOTES || rows[0].v < 2) return [];
  const top = rows.filter(x => x.v === rows[0].v).map(x => x.n);
  return top.length <= 2 ? top : [];
}

export async function inbox({ db, apply, ts = Date.now(), dry = false, log = () => {} }) {
  const out = { merged: 0, refused: 0, unknown: 0, cleaned: 0, votes: 0, voteRefused: 0, winners: 0, why: {} };
  const [box, votes, raw] = await Promise.all([db.get('fcf_in'), db.get('fcf_vote'), db.get('fcf_data/db')]);
  const blocks = {}, map = {};
  for (const [ek, r] of Object.entries(raw || {})) {
    const key = dk(ek), i = key.indexOf('__');
    if (i < 0 || !/^\d{4}\/\d{2}$/.test(key.slice(i + 2))) continue;
    const blk = decode(r);
    if (!blk || !Array.isArray(blk.players)) continue;
    blocks[ek] = { key, team: key.slice(0, i), season: key.slice(i + 2), blk, raw: r };
    blk.players.forEach((p, pi) => { if (p && p.confirmToken) map[sha('fcf-pv|' + p.confirmToken)] = { ek, pi }; });
  }
  const w = {}, audit = [];
  const rawPlayer = (ek, pi) => { const pl = blocks[ek].raw.players; const v = pl && (pl.v || pl); return (v && v[pi]) || {}; };
  // ── answers ──
  for (const [pk, entries] of Object.entries(box || {})) {
    const who = map[pk];
    let sliceT = null;
    for (const [id, e] of Object.entries(entries || {})) {
      const path = `fcf_in/${pk}/${id}`;
      if (!e || typeof e !== 'object') { w[path] = null; out.cleaned++; continue; }
      if (e.m) {
        if (sliceT === null) sliceT = (await db.get(`fcf_pv/${pk}/t`)) || 0;
        if (sliceT > e.m + KEEP_MERGED || ts - e.m > 30 * 864e5) { w[path] = null; out.cleaned++; }
        continue;
      }
      if (!who) {
        out.unknown++;
        if (ts - (+e.t || 0) > 7 * 864e5) { w[path] = null; out.cleaned++; }
        continue;
      }
      if (!dry && !(await db.claim(path, e.t, ts))) continue;
      const B = blocks[who.ek];
      const r = apply(B.blk, who.pi, e);
      // Refused (after the deadline, after the roll call): gone, so the player's
      // page stops showing it as his answer
      if (!r.ok) { out.refused++; out.why[r.why] = (out.why[r.why] || 0) + 1; w[path] = null; continue; }
      if (!r.f.length) continue;
      out.merged++;
      const P = B.blk.players[who.pi], base = `fcf_data/db/${who.ek}/players/v/${who.pi}/`, rp = rawPlayer(who.ek, who.pi);
      for (const f of r.f) {
        if (ARR.includes(f)) {
          // One index where the stored array is there; else the whole array
          // (a single index into a missing node would not read as an array)
          const st = rp[f];
          if (st && typeof st === 'object' && st.__arr === 1 && typeof r.si === 'number') w[base + f + '/v/' + r.si] = P[f][r.si] === undefined ? null : P[f][r.si];
          else { w[base + f] = { __arr: 1, v: P[f].map(x => x === undefined ? null : x) }; rp[f] = { __arr: 1 }; }
        } else if (f === 'rpeMeta') {
          const k = metaKey(B.blk.sessions[r.si]);
          if (k) w[base + 'rpeMeta/' + k] = P.rpeMeta[k];
        } else w[base + f] = P[f] === undefined ? null : P[f];
      }
      if (r.audit) audit.push(Object.assign({ ts: e.t || ts, user: P.name || 'Spieler', role: 'player', team: B.team, season: B.season, via: 'job' }, r.audit));
    }
  }
  // ── votes ──
  for (const [pk, vs] of Object.entries(votes || {})) {
    const who = map[pk];
    for (const [k, v] of Object.entries(vs || {})) {
      w[`fcf_vote/${pk}/${k}`] = null;           // counted or refused, it goes
      if (!who || !v || typeof v.n !== 'string') { out.voteRefused++; continue; }
      const B = blocks[who.ek], P = B.blk.players[who.pi];
      const si = (B.blk.sessions || []).findIndex(s => s && s.type === 'match' && metaKey(s) === k);
      const other = B.blk.players.some(x => x && x.name === v.n && x.name !== P.name);
      const voted = P.mvpV && typeof P.mvpV === 'object' && P.mvpV[k];
      // given after the vote closed (midnight after the day after): late
      const late = si >= 0 && berlin(+v.t || ts).day > addDays(sortKey(B.blk.sessions[si].date, B.season), 1);
      if (si < 0 || !other || voted || late) { out.voteRefused++; continue; }
      if (!P.mvpV || typeof P.mvpV !== 'object') P.mvpV = {};
      P.mvpV[k] = 1;
      const c = `fcf_data/db/${who.ek}/sessions/v/${si}/mvp/c/${pathKey(v.n)}`;
      w[c] = w[c] && w[c].__n ? { __n: w[c].__n + 1 } : { __n: 1 };
      w[`fcf_data/db/${who.ek}/players/v/${who.pi}/mvpV/${k}`] = 1;
      out.votes++;
      const s = B.blk.sessions[si];
      if (!s.mvp || typeof s.mvp !== 'object') s.mvp = {};
      if (!s.mvp.c || typeof s.mvp.c !== 'object') s.mvp.c = {};
      s.mvp.c[v.n] = (+s.mvp.c[v.n] || 0) + 1;
      audit.push({ ts: +v.t || ts, user: P.name || 'Spieler', role: 'player', team: B.team, season: B.season, via: 'job',
        action: 'Spieler des Spiels gewählt', target: s.date || '?', detail: 'Stimme abgegeben' });
    }
  }
  // ── winners for the slices, once a vote has closed ──
  const today = berlin(ts).day;
  for (const B of Object.values(blocks)) {
    const rules = decode(raw[pathKey(B.team + '__rules')]) || {};
    if (!rules.lk) continue;
    const tk = sha('fcf-pt|' + rules.lk);
    const want = {};
    (B.blk.sessions || []).forEach(s => {
      if (!s || s.type !== 'match' || !s.mvp || !s.mvp.c) return;
      const end = addDays(sortKey(s.date, B.season), 1);
      if (today <= end || today > addDays(end, MVP_SHOW_DAYS + 1)) return;
      const win = winners(s.mvp.c), k = metaKey(s);
      if (k && win.length) want[k] = win;
    });
    if (!Object.keys(want).length) continue;
    const have = (await db.get(`fcf_pt/${tk}/mvp`)) || {};
    for (const [k, win] of Object.entries(want)) {
      if (JSON.stringify(have[k]) !== JSON.stringify(win)) { w[`fcf_pt/${tk}/mvp/${k}`] = win; out.winners++; }
    }
  }
  audit.forEach((a, i) => { w[`fcf_data/auditLogP/j${ts.toString(36)}${i}`] = a; });
  // Increments as the database does them (two jobs at once must not lose a vote)
  for (const [p, v] of Object.entries(w)) if (v && typeof v === 'object' && v.__n) w[p] = db.inc(v.__n);
  if (!dry && Object.keys(w).length) await db.update(w);
  out.writes = Object.keys(w).length;
  return out;
}
