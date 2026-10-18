// Flutlicht · Sicherung — entry point of the GitHub workflow (sicherung.yml).
// Needs FIREBASE_SERVICE_ACCOUNT; DATUM=YYYYMMDD puts out a stored day instead.
import admin from 'firebase-admin';
import fs from 'node:fs';
import { sichern } from './sicherung.mjs';

const DB_URL = 'https://fc-frohlinde-ea23f-default-rtdb.europe-west1.firebasedatabase.app';
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) { console.log('FIREBASE_SERVICE_ACCOUNT fehlt – keine Sicherung.'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)), databaseURL: DB_URL });
const ref = p => admin.database().ref(p);
const db = { get: async p => (await ref(p).get()).val(), set: (p, v) => ref(p).set(v), remove: p => ref(p).remove() };
const datum = (process.env.DATUM || '').trim();
try {
  if (datum && !/^\d{8}$/.test(datum)) throw new Error('DATUM bitte als JJJJMMTT, z. B. 20261018');
  const r = await sichern({ db, datum });
  if (!r.ok) process.exitCode = 1;
  if (r.day && process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `TAG=${r.day}\n`);
} catch (e) {
  console.error('Sicherung fehlgeschlagen:', e && e.message || e);
  process.exitCode = 1;
} finally {
  await admin.app().delete();
}
