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
  }
  process.exit(0);
}
