// Flutlicht · Erinnerungen — what is due, decided from the data alone.
// Pure functions: no network, no clock of their own. send.mjs feeds them.
import crypto from 'node:crypto';

export const SITE = 'https://fc-frohlinde.github.io/';
export const QUIET_FROM = 22 * 60 + 30;   // no reminders from 22:30 …
export const QUIET_TO = 8 * 60;           // … until 8:00
export const RPE_AFTER = 20;              // minutes after the planned end
export const RPE_DEFAULT_MIN = 90;        // as in the app
export const VOTE_FROM = 17 * 60;         // the day after a match
export const RSVP_FROM = 18 * 60;         // the evening before

// ── the app's storage format (fbEncodeValue) ──
export function decode(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && !Array.isArray(val)) {
    if (val.__media) return null;                       // photos are not needed here
    if (val.__arr === 1) {
      if (!val.v) return [];
      let arr;
      if (Array.isArray(val.v)) arr = val.v;
      else {                                            // Firebase drops nulls: rebuild by index
        const keys = Object.keys(val.v).filter(k => /^\d+$/.test(k));
        const max = keys.length ? Math.max(...keys.map(Number)) : -1;
        arr = new Array(max + 1).fill(null);
        keys.forEach(k => { arr[+k] = val.v[k]; });
      }
      return arr.map(decode);
    }
    const out = {};
    for (const k of Object.keys(val)) {
      const dk = k.replace(/__SL__/g, '/').replace(/__DOT__/g, '.').replace(/__HASH__/g, '#')
        .replace(/__LB__/g, '[').replace(/__RB__/g, ']');
      out[dk] = decode(val[k]);
    }
    return out;
  }
  if (Array.isArray(val)) return val.map(decode);
  return val;
}
export function pathKey(k) {
  return String(k || '').replace(/\//g, '__SL__').replace(/\./g, '__DOT__').replace(/#/g, '__HASH__')
    .replace(/\[/g, '__LB__').replace(/\]/g, '__RB__');
}
export const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
export const ownerOf = token => 'p' + sha(token).slice(0, 24);

// ── dates, as the app reads them ──
export function sortKey(dateStr, season) {
  const m = String(dateStr || '').match(/(\d+)\.(\d+)/);
  if (!m) return 99999999;
  const d = +m[1], mo = +m[2];
  const sm = String(season || '').match(/^(\d{4})\/(\d{2})$/);
  const y1 = sm ? +sm[1] : 2025, y2 = y1 + 1;
  return (mo >= 7 ? y1 : y2) * 10000 + mo * 100 + d;
}
const isoKey = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0; };
export function addDays(key, n) {
  const d = new Date(Date.UTC(Math.floor(key / 10000), Math.floor(key / 100) % 100 - 1, key % 100 + n));
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
// Now in Berlin: {day: YYYYMMDD, min: minutes since midnight}
export function berlin(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return { day: +p.year * 10000 + +p.month * 100 + +p.day, min: +p.hour * 60 + +p.minute, ts };
}
// Seconds until midnight in Berlin: a reminder is worthless afterwards
export function ttlToMidnight(now) { return Math.max(600, (24 * 60 - now.min) * 60); }
export const quiet = now => now.min >= QUIET_FROM || now.min < QUIET_TO;

const startMin = s => { const t = String(s.time || '').split(':').map(Number); return (t.length === 2 && !isNaN(t[0])) ? t[0] * 60 + (t[1] || 0) : null; };
export function metaKey(s) {
  const m = String((s && s.date) || '').match(/(\d+)\.(\d+)/);
  if (!m) return null;
  const hm = String(s.time || '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  return 'k' + String(+m[2]).padStart(2, '0') + String(+m[1]).padStart(2, '0') + '-' + hm + (s.type === 'match' ? 'm' : 't');
}
const st = (p, si) => (Array.isArray(p.s) && si < p.s.length && p.s[si] != null) ? p.s[si] : 3;
const afterJoin = (p, s, season) => !p.joinDate || sortKey(s.date, season) >= isoKey(p.joinDate);
const rated = (p, si) => Array.isArray(p.rpe) && typeof p.rpe[si] === 'number';
const notThere = (p, s) => { const k = metaKey(s); const m = k && p.rpeMeta && p.rpeMeta[k]; return !!(m && m.nd); };
const voted = (p, s) => { const k = metaKey(s); return !!(k && p.mvpV && p.mvpV[k]); };
const minutes = (s, p, si) => (Array.isArray(p.rpeMin) && typeof p.rpeMin[si] === 'number') ? p.rpeMin[si]
  : (typeof s.duration === 'number' && s.duration > 0) ? s.duration : RPE_DEFAULT_MIN;
const hhmm = s => String(s.time || '').trim();
const against = s => s.label ? 'gegen ' + s.label : '';

// Is anything possibly due in this block now? Lets the job skip the players.
export function anyDue(sessions, season, now, cfg) {
  if (quiet(now)) return false;
  const today = now.day, yest = addDays(today, -1), tom = addDays(today, 1);
  return (sessions || []).some(s => {
    if (!s || !s.date) return false;
    const k = sortKey(s.date, season), sm = startMin(s);
    if (on(cfg, 'rpe') && k === today && sm != null && now.min >= sm + (s.duration > 0 ? s.duration : RPE_DEFAULT_MIN) + RPE_AFTER - 30) return true;
    if (on(cfg, 'vote') && s.type === 'match' && k === yest && now.min >= VOTE_FROM) return true;
    if (on(cfg, 'rsvp') && k === tom && now.min >= RSVP_FROM) return true;
    return false;
  });
}
const on = (cfg, k) => !(cfg && cfg[k] === false);

// What to send now: [{owner, pi, kind, key, payload, ttl}]. owners: Set of
// subscribed owner ids; sent: {"<kind>-<key>": {owner: ts}} for today.
export function plan({ sessions, players, season, team, now, cfg, owners, sent }) {
  const out = [];
  if (quiet(now)) return out;
  const today = now.day, yest = addDays(today, -1), tom = addDays(today, 1);
  const was = (kind, key, owner) => !!(sent && sent[kind + '-' + key] && sent[kind + '-' + key][owner]);
  (players || []).forEach((p, pi) => {
    if (!p || !p.confirmToken) return;
    const owner = ownerOf(p.confirmToken);
    if (!owners.has(owner)) return;
    const link = (q) => SITE + '?p=' + encodeURIComponent(p.confirmToken) + q;
    (sessions || []).forEach((s, si) => {
      if (!s || !s.date || !afterJoin(p, s, season)) return;
      const k = sortKey(s.date, season), key = metaKey(s), v = st(p, si), sm = startMin(s);
      if (!key) return;
      // Belastung: this session today, over for RPE_AFTER minutes, not answered
      if (on(cfg, 'rpe') && k === today && sm != null && v !== 0 && v !== 2
        && now.min >= sm + minutes(s, p, si) + RPE_AFTER
        && !rated(p, si) && !notThere(p, s) && !was('rpe', key, owner)) {
        out.push({ owner, pi, kind: 'rpe', key, ttl: ttlToMidnight(now), payload: {
          title: 'Wie anstrengend war’s heute?',
          body: (s.type === 'match' ? (s.label ? 'Spiel gegen ' + s.label : 'Spiel heute') : 'Training ' + hhmm(s))
            + ' – tipp kurz deine Zahl von 0 bis 10.',
          url: link('&do=rpe&s=' + si), tag: 'rpe-' + key } });
      }
      // Spieler des Spiels: yesterday's match, rated, not voted (vote closes tonight)
      if (on(cfg, 'vote') && s.type === 'match' && k === yest && now.min >= VOTE_FROM
        && v !== 0 && v !== 2 && rated(p, si) && !voted(p, s) && !was('vote', key, owner)) {
        out.push({ owner, pi, kind: 'vote', key, ttl: ttlToMidnight(now), payload: {
          title: 'Spieler des Spiels',
          body: (s.label ? 'Gegen ' + s.label + ' fehlt' : 'Für das Spiel gestern fehlt') + ' noch deine Stimme – bis heute 24 Uhr.',
          url: link('&do=vote&s=' + si), tag: 'vote-' + key } });
      }
      // Zu- oder Absage: tomorrow's session, no answer yet, deadline not passed
      if (on(cfg, 'rsvp') && k === tom && now.min >= RSVP_FROM && v === 3
        && !(typeof s.rsvpUntil === 'number' && now.ts > s.rsvpUntil) && !was('rsvp', key, owner)) {
        out.push({ owner, pi, kind: 'rsvp', key, ttl: ttlToMidnight(now) + 12 * 3600, payload: {
          title: 'Morgen ' + (s.type === 'match' ? 'Spiel' + (s.label ? ' ' + against(s) : '') : 'Training') + (hhmm(s) ? ', ' + hhmm(s) : ''),
          body: 'Bist du dabei? Sag kurz zu oder ab.',
          url: link('&do=week'), tag: 'rsvp-' + key } });
      }
    });
  });
  return out;
}
