// Flutlicht · Benachrichtigungen für Trainer — what is due, from the data alone.
//
// A trainer switches them on in Einstellungen → Benachrichtigungen → „Aufs
// Handy“. His device is stored like a player's, under the owner
// t<sha256("trainer:"+name)>, with tp:1, his name and the team/season he had
// open. Which kinds he wants lives with his other personal settings in
// fcf_data/userAutomation/<name>/push (missing = default below). Players never
// get any of these. Never between 22:30 and 8:00; what falls in that time
// comes with the first round after 8:00 if it still matters.
import { SITE, sortKey, metaKey, addDays, ttlToMidnight, sha } from './lib.mjs';

export const TKINDS = { bday: true, msg: true, att: true, late: false, lineup: false, tech: true };
export const BDAY_DAY = 8 * 60;      // the day itself, from 8:00
export const BDAY_EVE = 18 * 60;     // the evening before, from 18:00
export const ATT_FROM = 9 * 60;      // the morning after a session without a full roll call
export const LATE_MIN = 24 * 60;     // a cancellation in the last 24 h before the start
export const LINEUP_MIN = 3 * 60;    // the state of answers 3 h before the start
export const SAFE_STALE = 50 * 3600e3;   // the daily copy is overdue
export const GAP_MIN = 150;              // rounds paused this long in the day

export const trainerOwner = name => 't' + sha('trainer:' + (name || '')).slice(0, 24);
export function kindsOf(pref) {
  const o = {};
  for (const k of Object.keys(TKINDS)) o[k] = (pref && typeof pref[k] === 'boolean') ? pref[k] : TKINDS[k];
  return o;
}
// A name the app knows as trainer of this team, or the admin
export function allowed(name, team, trainers) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  if (n === 'admin') return true;
  return (Array.isArray(trainers) ? trainers : Object.values(trainers || {}))
    .some(t => t && String(t.name || '').toLowerCase() === n && Array.isArray(t.teams) && t.teams.includes(team));
}

const st = (p, si) => (Array.isArray(p.s) && si < p.s.length && p.s[si] != null) ? p.s[si] : 3;
const isoKey = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0; };
const afterJoin = (p, s, season) => !p.joinDate || sortKey(s.date, season) >= isoKey(p.joinDate);
const startMin = s => { const t = String(s.time || '').split(':').map(Number); return (t.length === 2 && !isNaN(t[0])) ? t[0] * 60 + (t[1] || 0) : null; };
const dayNum = k => Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100) / 864e5;
// minutes from now until the start of a session (negative: started)
const until = (s, season, now) => { const sm = startMin(s); return sm == null ? null : (dayNum(sortKey(s.date, season)) - dayNum(now.day)) * 1440 + sm - now.min; };
const real = s => s && s.date && (s.type === 'training' || s.type === 'match');
const what = s => s.type === 'match' ? 'Spiel' + (s.label ? ' gegen ' + s.label : '') : 'Training';
const names = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' und ' + a.at(-1);
const go = (q, b) => SITE + '?go=' + q + (b ? '&gt=' + encodeURIComponent(b.team) + '&gs=' + encodeURIComponent(b.season) : '');
export function parseBirth(str) {
  const s = String(str || '');
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  return null;
}

// ── per team: birthdays, roll call, cancellations, answers before the start ──
// b: {team, season, sessions, players}; phase hints what to look at.
export function birthdays(b, now, eve) {
  const day = eve ? addDays(now.day, 1) : now.day;
  const mo = Math.floor(day / 100) % 100, d = day % 100, y = Math.floor(day / 10000);
  const who = [];
  (b.players || []).forEach((p, pi) => {
    if (!p || !p.name) return;
    const bd = parseBirth(p.birthdate);
    if (bd && bd.m === mo && bd.d === d) who.push({ pi, name: p.name, age: y - bd.y });
  });
  if (!who.length) return null;
  const list = names(who.map(w => w.name + (who.length > 1 ? ' (' + w.age + ')' : '')));
  let body;
  if (who.length === 1) body = who[0].name + ' wird ' + (eve ? '' : 'heute ') + who[0].age + '.';
  else body = list + ' haben ' + (eve ? 'morgen' : 'heute') + ' Geburtstag.';
  if (eve) {
    const tom = (b.sessions || []).filter(s => real(s) && sortKey(s.date, b.season) === day && startMin(s) != null)
      .sort((x, z) => startMin(x) - startMin(z))[0];
    if (tom) body += ' Morgen ' + (tom.type === 'match' ? 'Spiel' : 'Training') + ' um ' + tom.time + '.';
  }
  return { key: (eve ? 'eve-' : 'day-') + day, title: eve ? 'Morgen Geburtstag 🎂' : 'Heute Geburtstag 🎉', body,
    url: go('player&gi=' + who[0].pi, b), ttl: ttlToMidnight(now) };
}
// Yesterday's sessions with players still open after the roll call (or none at all)
export function rollCall(b, now) {
  const yest = addDays(now.day, -1), out = [];
  (b.sessions || []).forEach((s, si) => {
    if (!real(s) || sortKey(s.date, b.season) !== yest) return;
    let open = 0, there = 0;
    (b.players || []).forEach(p => {
      if (!p || !afterJoin(p, s, b.season)) return;
      const v = st(p, si);
      if (v === 1) there++;
      else if (v === 3 || v === 4) open++;
    });
    if (!open) return;
    out.push({ key: metaKey(s), title: 'Anwesenheit fehlt',
      body: what(s) + ' ' + s.date + (there ? ': ' + open + ' Spieler noch ohne Eintrag.' : ': noch nicht eingetragen. Ohne Eintrag zählen Karte und Statistik der Spieler nicht.'),
      url: go('rc&gi=' + si, b), ttl: ttlToMidnight(now) });
  });
  return out;
}
// Who said "kann nicht" since the last round, for sessions starting within
// LATE_MIN. snap: {<sessionKey>: {<name>: status}} as of the last round; the
// first look at a session only takes note. Returns {items, snap}.
export function cancellations(b, now, snap) {
  const next = {}, items = [];
  (b.sessions || []).forEach((s, si) => {
    if (!real(s)) return;
    const u = until(s, b.season, now);
    if (u == null || u <= 0 || u > LATE_MIN) return;
    const key = metaKey(s), prev = snap && snap[key], cur = {}, gone = [];
    let there = 0;
    (b.players || []).forEach(p => {
      if (!p || !p.name || !afterJoin(p, s, b.season)) return;
      const v = st(p, si), nk = p.name;
      cur[nk] = v;
      if (v === 4 || v === 1) there++;
      if (prev && v === 0 && prev[nk] !== undefined && prev[nk] !== 0 && prev[nk] !== 2) gone.push(p.name);
    });
    next[key] = cur;
    if (!gone.length) return;
    const when = sortKey(s.date, b.season) === now.day ? 'heute' : 'morgen';
    items.push({ key: key + '-' + now.ts, title: 'Absage: ' + (s.type === 'match' ? 'Spiel' : 'Training') + ' ' + when + ' ' + s.time,
      body: names(gone) + (gone.length > 1 ? ' haben' : ' hat') + ' abgesagt. Jetzt ' + there + ' dabei.',
      url: go('sess&gi=' + si, b), ttl: Math.max(600, u * 60) });
  });
  return { items, snap: next };
}
// LINEUP_MIN before the start (or the first round after 8:00): who is coming
export function lineup(b, now) {
  const out = [];
  (b.sessions || []).forEach((s, si) => {
    if (!real(s) || sortKey(s.date, b.season) !== now.day) return;
    const u = until(s, b.season, now);
    if (u == null || u <= 0 || u > LINEUP_MIN) return;
    let yes = 0, no = 0, open = 0;
    (b.players || []).forEach(p => {
      if (!p || !afterJoin(p, s, b.season)) return;
      const v = st(p, si);
      if (v === 4 || v === 1) yes++; else if (v === 0 || v === 2) no++; else open++;
    });
    out.push({ key: metaKey(s), title: what(s) + ' heute ' + s.time,
      body: yes + ' dabei, ' + no + ' abgesagt, ' + open + ' offen', url: go('sess&gi=' + si, b), ttl: Math.max(600, u * 60) });
  });
  return out;
}
// Does this team need its players read now? (most rounds: no)
export function needsPlayers(b, now, kinds, done) {
  if (kinds.bday && ((now.min >= BDAY_DAY && !done('bdaychk-d')) || (now.min >= BDAY_EVE && !done('bdaychk-e')))) return true;
  const ss = (b.sessions || []).filter(real);
  if (kinds.att && now.min >= ATT_FROM && !done('attchk') && ss.some(s => sortKey(s.date, b.season) === addDays(now.day, -1))) return true;
  if (kinds.late && ss.some(s => { const u = until(s, b.season, now); return u != null && u > 0 && u <= LATE_MIN; })) return true;
  if (kinds.lineup && ss.some(s => { const u = until(s, b.season, now); return sortKey(s.date, b.season) === now.day && u != null && u > 0 && u <= LINEUP_MIN && !done('lineup-' + metaKey(s)); })) return true;
  return false;
}

// ── for everyone, wherever: messages and the machinery ──
export function messages(list, now, name) {
  const me = String(name || '').toLowerCase();
  return (Array.isArray(list) ? list : Object.values(list || {})).filter(m => m && m.id && m.ts && now.ts - m.ts < 24 * 3600e3 && m.ts <= now.ts + 60e3
    && String(m.from || '').toLowerCase() !== me && (!m.to || m.to === '*' || String(m.to).toLowerCase() === me))
    .map(m => ({ key: String(m.id), title: 'Nachricht von ' + m.from,
      body: String(m.text || '').slice(0, 180) + (String(m.text || '').length > 180 ? '…' : ''),
      url: go('msg&gid=' + encodeURIComponent(m.id)), ttl: 24 * 3600 }));
}
export function machinery({ safe, prev, now }) {
  const out = [];
  if (safe && safe.t && now.ts - safe.t > SAFE_STALE) {
    const d = Math.floor((now.ts - safe.t) / 864e5);
    out.push({ key: 'safe', title: 'Sicherung läuft nicht',
      body: 'Die letzte geschützte Tageskopie ist ' + d + ' Tage alt. Auf GitHub unter Actions → Sicherung nachsehen.',
      url: go('backup'), ttl: ttlToMidnight(now) });
  }
  if (prev && prev.t) {
    const gap = prev.day === now.day ? (now.ts - prev.t) / 60000 : now.min - 7 * 60;
    if (gap > GAP_MIN) {
      const h = Math.round(gap / 60);
      out.push({ key: 'timer', title: 'Erinnerungen hatten Pause',
        body: 'Etwa ' + h + ' Std. lief keine Runde. Den Zeitgeber auf cron-job.org prüfen (Token abgelaufen?).',
        url: SITE, ttl: ttlToMidnight(now) });
    }
  }
  return out;
}
