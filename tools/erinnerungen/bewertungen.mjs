// Flutlicht · Übersicht der Bewertungen (nur lesen; ins Protokoll nur Zahlen).
// Je Team die letzten Termine: anwesend, bewertet (am selben Tag / später),
// "nicht dabei", Stimmen für den Spieler des Spiels. Keine Namen, keine Werte.
//   node bewertungen.mjs        (FIREBASE_SERVICE_ACCOUNT im Umfeld)
import { decode, sortKey, berlin, metaKey } from './lib.mjs';

export function summary(blk, season, now, n = 8) {
  const S = (blk && blk.sessions) || [], P = ((blk && blk.players) || []).filter(Boolean);
  const today = berlin(now).day;
  const rows = [];
  S.forEach((s, si) => {
    if (!s || !s.date) return;
    const day = sortKey(s.date, season);
    if (!day || day >= today) return;
    const k = metaKey(s);
    let here = 0, rated = 0, same = 0, later = 0, nd = 0;
    for (const p of P) {
      if (Array.isArray(p.s) && p.s[si] === 1) here++;
      const m = p.rpeMeta && k ? p.rpeMeta[k] : null;
      if (Array.isArray(p.rpe) && typeof p.rpe[si] === 'number') {
        rated++;
        if (m && m.s === 'p' && m.t) (berlin(m.t).day === day ? same++ : later++);
      } else if (m && m.nd) nd++;
    }
    const votes = s.type === 'match' ? Object.values((s.mvp && s.mvp.c) || {}).reduce((a, v) => a + (+v || 0), 0) : null;
    rows.push({ day, type: s.type === 'match' ? 'Spiel' : 'Training', here, rated, same, later, nd, votes });
  });
  return rows.sort((a, b) => a.day - b.day).slice(-n);
}

export function usage(blk, now) {
  const D = 864e5, P = ((blk && blk.players) || []).filter(p => p && !p.gone && !p.trial && !(p.probe && !p.joinDate));
  const u = { n: P.length, ever: 0, d7: 0, d14: 0, app: 0, app14: 0, never: 0 };
  for (const p of P) {
    const t = +(p.seen && p.seen.t) || 0, a = +(p.seen && p.seen.a) || 0;
    if (t) u.ever++; else u.never++;
    if (t && now - t < 7 * D) u.d7++;
    if (t && now - t < 14 * D) u.d14++;
    if (a) u.app++;
    if (a && now - a < 14 * D) u.app14++;
  }
  return u;
}

// Einsatz (perf: 1 stark, 2 normal, 3 schwach) je Monat — nur Zahlen, für
// „Spieler des Monats“ (1.2.114): wie viel ist überhaupt eingetragen?
export function einsatz(blk, season, now) {
  const S = (blk && blk.sessions) || [], P = ((blk && blk.players) || []).filter(Boolean);
  const today = berlin(now).day, M = {};
  S.forEach((s, si) => {
    if (!s || !s.date) return;
    const day = sortKey(s.date, season);
    if (!day || day >= today) return;
    const m = String(day).slice(0, 6), r = M[m] || (M[m] = { t: 0, sp: 0, mit: 0, up: 0, mid: 0, down: 0, top: {} });
    s.type === 'match' ? r.sp++ : r.t++;
    let any = false;
    P.forEach((p, i) => {
      const v = Array.isArray(p.perf) ? p.perf[si] : null;
      if (v === 1) { r.up++; any = true; r.top[i] = (r.top[i] || 0) + 1; } else if (v === 2) { r.mid++; any = true; } else if (v === 3) { r.down++; any = true; }
    });
    if (any) r.mit++;
  });
  return Object.entries(M).sort().map(([m, r]) => {
    const t = Object.values(r.top);
    return `${m.slice(4)}/${m.slice(0, 4)}: Termine ${r.t + r.sp} (T ${r.t}, S ${r.sp}), mit Einsatz ${r.mit}, ▲ ${r.up}, normal ${r.mid}, ▼ ${r.down}, Spieler mit ▲ ${t.length}, max ▲ eines Spielers ${t.length ? Math.max(...t) : 0}`;
  });
}

const line = r => `${String(r.day).slice(6, 8)}.${String(r.day).slice(4, 6)}. ${r.type}: anwesend ${r.here}, bewertet ${r.rated}`
  + ` (selber Tag ${r.same}, später ${r.later}), nicht dabei ${r.nd}` + (r.votes === null ? '' : `, Stimmen ${r.votes}`);

if (import.meta.url === `file://${process.argv[1]}`) {
  const { default: admin } = await import('firebase-admin');
  const DB_URL = 'https://fc-frohlinde-ea23f-default-rtdb.europe-west1.firebasedatabase.app';
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), databaseURL: DB_URL });
  const G = decode((await admin.database().ref('fcf_data/db').get()).val()) || {};
  const now = Date.now(), d = new Date(now), y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const season = y + '/' + String(y + 1).slice(-2);
  for (const [key, blk] of Object.entries(G)) {
    if (!key.endsWith('__' + season) || !blk || !Array.isArray(blk.sessions)) continue;
    const team = key.slice(0, key.indexOf('__'));
    const rows = summary(blk, season, now);
    if (!rows.length) continue;
    rows.forEach(r => console.log(team + ' ' + line(r)));
    console.log(`::notice title=Bewertungen ${team}::` + rows.map(line).join(' || '));
    // App-Nutzung der Spieler (1.2.110): nur Zahlen
    const u = usage(blk, now);
    console.log(`::notice title=Einsatz ${team}::` + einsatz(blk, season, now).join(' || '));
    console.log(`::notice title=Nutzung ${team}::Spieler ${u.n}: je geöffnet ${u.ever}, letzte 7 Tage ${u.d7}, letzte 14 Tage ${u.d14}, als App installiert (je) ${u.app}, als App letzte 14 Tage ${u.app14}, nie geöffnet ${u.never}`);
  }
  // Push: Dienste der Geräte von Spielern (Apple = iPhone/iPad, Google = Android/Chrome)
  const subs = (await admin.database().ref('fcf_push/subs').get()).val() || {};
  const svc = {};
  for (const [o, devs] of Object.entries(subs)) {
    if (o[0] !== 'p') continue;
    for (const d of Object.values(devs || {})) {
      if (!d || !d.e) continue;
      const h = (String(d.e).match(/^https:\/\/([^/]+)/) || [])[1] || '?';
      const k = /apple/.test(h) ? 'Apple' : /google|fcm/.test(h) ? 'Google' : /mozilla/.test(h) ? 'Mozilla' : /windows|wns/.test(h) ? 'Microsoft' : 'andere';
      svc[k] = (svc[k] || 0) + 1;
    }
  }
  console.log('::notice title=Push Spieler::' + (Object.entries(svc).map(([k, c]) => k + ' ' + c).join(', ') || 'keine'));
  process.exit(0);
}
