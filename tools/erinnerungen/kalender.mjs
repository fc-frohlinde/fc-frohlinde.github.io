// Flutlicht · Kalender-Abo — the team's dates as a calendar feed (.ics) that
// Google, Apple or Outlook subscribe to and refresh on their own.
//
// For the trainers: one feed per team, the current season from 30 days back —
// trainings, matches (with the meeting time once the squad is published) and
// the team's other dates. No player names. Each round builds it; only when it
// changed is it written to a secret gist (KALENDER_TOKEN, a GitHub token with
// just the "gist" scope). The address is known only to whoever has the link:
//   fcf_push/cal/<team>   {gist, file, user, h, t}   this job only
//   fcf_cal/<team>        {url, t}                   members (trainers with an account) read it
// Never print the address or the gist id: the job's log is public.
import crypto from 'node:crypto';
import { decode, pathKey, sortKey, addDays } from './lib.mjs';

const CLUB = 'FC Frohlinde';
const SITE = 'https://fc-frohlinde.github.io/';
const BACK_DAYS = 30;

// The season a Berlin day belongs to: July to June
export function seasonOf(day) {
  const y = Math.floor(day / 10000), m = Math.floor(day / 100) % 100;
  const y1 = m >= 7 ? y : y - 1;
  return y1 + '/' + String((y1 + 1) % 100).padStart(2, '0');
}
// A team's key in fcf_cal and the feed's file name: letters and digits only
export const slug = team => String(team || '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'team';

// ── iCalendar text ──
const esc = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Lines longer than 75 octets are folded (continuation lines start with a space)
function fold(line) {
  const b = Buffer.from(line, 'utf8');
  if (b.length <= 75) return line;
  const out = [];
  let cur = '', n = 0, first = true;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, 'utf8');
    if (n + len > (first ? 75 : 74)) { out.push(cur); cur = ''; n = 0; first = false; }
    cur += ch; n += len;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const pad = n => String(n).padStart(2, '0');
const local = (y, mo, d, h, mi) => `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}00`;
const VTZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'];

// One event. start: "HH:MM" or none (then all day); minutes: length
function vevent({ uid, k, time, minutes, summary, location, description, stamp }) {
  const y = Math.floor(k / 10000), mo = Math.floor(k / 100) % 100, d = k % 100;
  const L = ['BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp];
  const t = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  if (t) {
    const s = new Date(Date.UTC(y, mo - 1, d, +t[1], +t[2]));
    const e = new Date(s.getTime() + (minutes > 0 ? minutes : 90) * 60000);
    L.push('DTSTART;TZID=Europe/Berlin:' + local(y, mo, d, +t[1], +t[2]));
    L.push('DTEND;TZID=Europe/Berlin:' + local(e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate(), e.getUTCHours(), e.getUTCMinutes()));
  } else {
    const n = new Date(Date.UTC(y, mo - 1, d + 1));
    L.push('DTSTART;VALUE=DATE:' + `${y}${pad(mo)}${pad(d)}`);
    L.push('DTEND;VALUE=DATE:' + `${n.getUTCFullYear()}${pad(n.getUTCMonth() + 1)}${pad(n.getUTCDate())}`);
  }
  L.push('SUMMARY:' + esc(summary));
  if (location) L.push('LOCATION:' + esc(location));
  if (description) L.push('DESCRIPTION:' + esc(description));
  L.push('END:VEVENT');
  return L;
}

// The squad of a match as the app keeps it, if published and not withdrawn
const squadOf = s => { const q = s && s.squad; return (q && typeof q === 'object' && Array.isArray(q.p) && typeof q.t === 'number' && !q.off) ? q : null; };

// The feed of one team for one season. now: berlin(ts)
export function buildIcs({ team, season, sessions, events, now, club = CLUB }) {
  const from = addDays(now.day, -BACK_DAYS), sl = slug(team);
  const stamp = new Date(now.ts).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Flutlicht//Kalender-Abo//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(club + ' ' + team), 'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', ...VTZ];
  const list = [];
  (sessions || []).forEach(s => {
    if (!s || !s.date) return;
    const k = sortKey(s.date, season);
    if (k === 99999999 || k < from) return;
    const isM = s.type === 'match', hhmm = String(s.time || '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
    let summary, description = [];
    if (isM) {
      summary = 'Spiel' + (s.label ? ' gegen ' + s.label : '');
      if (s.homeAway === 'home') description.push('Heimspiel'); else if (s.homeAway === 'away') description.push('Auswärtsspiel');
      if (s.time) description.push('Anstoß ' + s.time);
      const q = squadOf(s);
      if (q && q.meet) description.push('Treffpunkt ' + q.meet + (q.where ? ', ' + q.where : ''));
    } else {
      summary = 'Training' + (s.focus ? ' · ' + s.focus : '');
    }
    description.push('Flutlicht: ' + SITE);
    list.push({ k, t: hhmm, ev: vevent({ uid: `${k}-${hhmm}-${isM ? 'm' : 't'}-${sl}@fc-frohlinde.github.io`, k, time: s.time,
      minutes: typeof s.duration === 'number' ? s.duration : (isM ? 105 : 90), summary, location: s.location || '', description: description.join('\n'), stamp }) });
  });
  (events || []).forEach(ev => {
    if (!ev || !ev.date) return;
    const k = sortKey(ev.date, season);
    if (k === 99999999 || k < from) return;
    const id = String(ev.id || (k + '-' + (ev.name || ''))).replace(/[^A-Za-z0-9_-]/g, '');
    list.push({ k, t: String(ev.time || '').replace(/\D/g, '').padStart(4, '0'), ev: vevent({ uid: `ev-${id}-${sl}@fc-frohlinde.github.io`, k, time: ev.time,
      minutes: 60, summary: ev.name || 'Termin', location: '', description: [ev.note || '', 'Flutlicht: ' + SITE].filter(Boolean).join('\n'), stamp }) });
  });
  list.sort((a, b) => a.k - b.k || a.t.localeCompare(b.t));
  list.forEach(x => L.push(...x.ev));
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
// What a change is measured by: everything except the time stamp of the build
export const icsHash = ics => crypto.createHash('sha256').update(ics.replace(/^DTSTAMP:.*\r\n/gm, '')).digest('hex').slice(0, 32);

// ── publishing ──
async function gh(fetchFn, token, method, path, body) {
  const r = await fetchFn('https://api.github.com' + path, { method, headers: {
    Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'flutlicht-kalender', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, ok: r.ok, j };
}
// Every team of the current season: build, and publish what changed.
// load(bk, 'sessions') reuses what the round already read. Returns a status
// for fcf_push/status.cal: {t: last publication, n: teams, err?: http code}
export async function publishCalendars({ db, now, token, fetchFn, load, log = console.log, dry = false, prev = {} }) {
  const out = { t: prev.t || 0, n: 0 };
  if (!token) { out.off = 1; return out; }
  const season = seasonOf(now.day);
  const teams = decode(await db.get('fcf_data/teamList')) || [];
  const club = (await db.get('fcf_data/clubName')) || CLUB;
  for (const team of teams) {
    if (typeof team !== 'string' || !team) continue;
    const bk = team + '__' + season;
    const sessions = await load(bk, 'sessions');
    if (!sessions || !sessions.length) continue;
    const events = decode(await db.get(`fcf_data/calEvents/${pathKey(bk)}`)) || [];
    const ics = buildIcs({ team, season, sessions, events, now, club: typeof club === 'string' ? club : CLUB });
    const h = icsHash(ics), sl = slug(team), state = (await db.get(`fcf_push/cal/${sl}`)) || {};
    out.n++;
    if (state.h === h && state.gist) continue;
    if (dry) { log('[dry] Kalender', team, 'würde aktualisiert'); continue; }
    const file = 'fc-frohlinde-' + sl.toLowerCase() + '.ics';
    const description = 'Flutlicht · Kalender ' + (typeof club === 'string' ? club : CLUB) + ' ' + team;
    let r = state.gist ? await gh(fetchFn, token, 'PATCH', '/gists/' + state.gist, { description, files: { [file]: { content: ics } } }) : null;
    if (!r || r.status === 404) r = await gh(fetchFn, token, 'POST', '/gists', { description, public: false, files: { [file]: { content: ics } } });
    if (!r.ok || !r.j || !r.j.id || !r.j.owner || !r.j.owner.login) { out.err = r.status || 1; log('Kalender', team + ': GitHub antwortet', r.status); continue; }
    const url = `https://gist.githubusercontent.com/${r.j.owner.login}/${r.j.id}/raw/${file}`;
    await db.set(`fcf_push/cal/${sl}`, { gist: r.j.id, file, user: r.j.owner.login, h, t: now.ts });
    const pub = (await db.get(`fcf_cal/${sl}`)) || {};
    if (pub.url !== url || pub.team !== team) await db.set(`fcf_cal/${sl}`, { url, team, t: now.ts });
    out.t = now.ts;
    log('Kalender', team, state.gist ? 'aktualisiert' : 'angelegt');
  }
  return out;
}
