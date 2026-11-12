// Flutlicht · Abendkopie — a second protected copy on days with a training or
// a match, about two hours after it ended.
//
// Why (08.11.2026, vorfall-2026-11-08-sync.md): the day's copies came before
// the match — the app's own at the first opening of the day (00:03), the
// protected one at night (GitHub runs it in the morning). An old copy on a PC
// overwrote the match day at 19:47; there was nothing to go back to. A copy
// taken in the evening after the event keeps what was entered there:
// attendance, Spielbericht, the first ratings.
//
// Runs inside the reminder job (every 15 minutes, cron-job.org 7–22 Uhr), not
// as its own workflow: GitHub's schedule is hours late. Once a day at most,
// at the first run ABEND_NACH minutes after the end of the first event of
// the day — or, if that is too late for the last runs, from ABEND_SPAET on.
//
//   fcf_safe/abend/<YYYYMMDD>       {t, day, size, gz, ev}   like fcf_safe/daily
//   fcf_safe/abendIndex/<YYYYMMDD>  {t, size, ev}
//   __backups_meta/safeAbend        {t, day, size, days, ev} status for the app
// ev is only the kind and time ("Training 18:30"), no names. KEEP_ABEND days.
// Restore: Actions → Sicherung → Run workflow, Datum „JJJJMMTT-abend“.
import zlib from 'node:zlib';
import { berlin, addDays } from './lib.mjs';

export const ABEND_NACH = 120;          // minutes after the end
export const ABEND_SPAET = 22 * 60 + 30; // the last runs of the day (22:37, 22:52)
export const KEEP_ABEND = 30;
const DUR = { training: 90, match: 105 }; // as the app's calendar, when a session has no duration

// "Di 10.11" in a season "2026/27" → 20261110 (July–June)
export function dayKey(dateStr, season) {
  const m = String(dateStr || '').match(/(\d+)\.(\d+)/);
  if (!m) return 0;
  const d = +m[1], mo = +m[2];
  const sm = String(season || '').match(/^(\d{4})\/(\d{2})$/);
  const y1 = sm ? +sm[1] : 0;
  return (mo >= 7 ? y1 : y1 + 1) * 10000 + mo * 100 + d;
}
const startMin = s => { const t = String(s.time || '').split(':').map(Number); return (t.length === 2 && !isNaN(t[0])) ? t[0] * 60 + (t[1] || 0) : null; };

// Is the evening copy due now? sessionsList: one sessions array per team.
// → {due, ev:{label, end}} with the first event of today that has ended.
export function abendFaellig({ sessionsList, season, now }) {
  let best = null;
  for (const sessions of sessionsList || []) {
    for (const s of sessions || []) {
      if (!s || !s.date || dayKey(s.date, season) !== now.day) continue;
      const st = startMin(s); if (st == null) continue;
      const match = s.type === 'match';
      const end = st + ((typeof s.duration === 'number' && s.duration > 0) ? s.duration : (match ? DUR.match : DUR.training));
      if (now.min < end) continue;
      if (!best || end < best.end) best = { end, label: (match ? 'Spiel ' : 'Training ') + String(s.time).trim() };
    }
  }
  if (!best) return { due: false, ev: null };
  return { due: now.min >= best.end + ABEND_NACH || now.min >= ABEND_SPAET, ev: best };
}

// Write the copy (the caller decided it is due).
export async function abendSichern({ db, ts = Date.now(), ev = '' }) {
  const now = berlin(ts);
  const fcf_data = await db.get('fcf_data');
  if (!fcf_data || !fcf_data.db) throw new Error('fcf_data leer oder ohne db – keine Abendkopie geschrieben');
  const fcf_plans = await db.get('fcf_plans');
  const raw = JSON.stringify({ fcf_data, fcf_plans });
  const gz = zlib.gzipSync(raw, { level: 9 }).toString('base64');
  await db.set('fcf_safe/abend/' + now.day, { t: ts, day: now.day, size: raw.length, gz, ev });
  await db.set('fcf_safe/abendIndex/' + now.day, { t: ts, size: raw.length, ev });
  const idx = (await db.get('fcf_safe/abendIndex')) || {};
  const limit = addDays(now.day, -KEEP_ABEND);
  for (const d of Object.keys(idx)) if (+d <= limit) {
    await db.remove('fcf_safe/abend/' + d); await db.remove('fcf_safe/abendIndex/' + d); delete idx[d];
  }
  const days = Object.keys(idx).length;
  await db.set('__backups_meta/safeAbend', { t: ts, day: now.day, size: raw.length, days, ev });
  return { ok: true, day: now.day, size: raw.length, gzSize: gz.length, days, ev };
}

// One run: nothing if today's copy exists or nothing has ended; loadSessions()
// returns the sessions arrays of all teams for the season (only read when needed).
export async function abend({ db, ts = Date.now(), season, loadSessions, dry = false }) {
  const now = berlin(ts);
  if (now.min < 9 * 60) return { skip: 'früh' };
  if (await db.get('fcf_safe/abendIndex/' + now.day)) return { skip: 'schon' };
  const f = abendFaellig({ sessionsList: await loadSessions(), season, now });
  if (!f.due) return { skip: f.ev ? 'wartet' : 'kein Termin', ev: f.ev };
  if (dry) return { dry: true, ev: f.ev };
  return await abendSichern({ db, ts, ev: f.ev.label });
}
