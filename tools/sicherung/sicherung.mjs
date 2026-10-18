// Flutlicht · Sicherung — a protected copy of the data, once a day.
//
// The app's own backups (__backups) sit in the same database and can be read
// and deleted by anyone who knows its address. This copy cannot: it goes to
// fcf_safe, for which no rule exists, so only this job (service account) can
// read or write it. Kept for KEEP_DAYS days.
//
//   fcf_safe/daily/<YYYYMMDD>  {t, day, size, gz}  gz = base64(gzip(JSON {fcf_data, fcf_plans}))
//   fcf_safe/index/<YYYYMMDD>  {t, size}           list without downloading every copy
//   __backups_meta/safe        {t, day, size, days} status for the app (readable, only the job writes)
//
// Each run also writes out/flutlicht-<day>.json in the app's own backup format
// (import in the app: Backups → „Aus Datei“) plus the training planner; the
// workflow encrypts them with SICHERUNG_PASSWORT and keeps them 90 days on
// GitHub — or leaves them out if no password is set. With DATUM=YYYYMMDD the
// run writes nothing to the database and only puts out that stored day.
import zlib from 'node:zlib';
import fs from 'node:fs';
import { decode, berlin, addDays } from './lib.mjs';

export const KEEP_DAYS = 30;

export async function sichern({ db, ts = Date.now(), datum = '', outDir = 'out', log = console.log }) {
  const now = berlin(ts);
  const unpack = rec => JSON.parse(zlib.gunzipSync(Buffer.from(rec.gz, 'base64')).toString('utf8'));
  const write = (day, payload) => {
    fs.mkdirSync(outDir, { recursive: true });
    const G = decode(payload.fcf_data);
    fs.writeFileSync(`${outDir}/flutlicht-${day}.json`, JSON.stringify(G));
    if (payload.fcf_plans) fs.writeFileSync(`${outDir}/trainingsplaner-${day}.json`, JSON.stringify(payload.fcf_plans));
    fs.writeFileSync(`${outDir}/LIESMICH.txt`,
      `Flutlicht – Sicherung vom ${String(day).replace(/(\d{4})(\d{2})(\d{2})/, '$3.$2.$1')}\n\n` +
      `flutlicht-${day}.json: alle Daten der App. Wiederherstellen in der App: Einstellungen → Daten-Backups → „Aus Datei“,\n` +
      `diese Datei wählen, danach in der Liste „Laden“. Fotos kommen aus der Datenbank zurück.\n` +
      `trainingsplaner-${day}.json: Trainingsplaner (Übungen, Pläne) – zum Wiederherstellen Claude fragen.\n`);
    return G;
  };

  if (datum) {
    const rec = await db.get('fcf_safe/daily/' + datum);
    if (!rec) {
      const idx = Object.keys((await db.get('fcf_safe/index')) || {}).sort();
      log(`Keine Tageskopie für ${datum}. Vorhanden: ${idx.join(', ') || 'keine'}`);
      return { ok: false };
    }
    write(datum, unpack(rec));
    log(`Tageskopie ${datum} als Datei ausgegeben`);
    return { ok: true, day: datum, exported: true };
  }

  const fcf_data = await db.get('fcf_data');
  if (!fcf_data || !fcf_data.db) throw new Error('fcf_data leer oder ohne db – keine Sicherung geschrieben');
  const fcf_plans = await db.get('fcf_plans');
  const raw = JSON.stringify({ fcf_data, fcf_plans });
  const gz = zlib.gzipSync(raw, { level: 9 }).toString('base64');
  await db.set('fcf_safe/daily/' + now.day, { t: ts, day: now.day, size: raw.length, gz });
  await db.set('fcf_safe/index/' + now.day, { t: ts, size: raw.length });

  // Keep KEEP_DAYS days
  const idx = (await db.get('fcf_safe/index')) || {};
  const limit = addDays(now.day, -KEEP_DAYS);
  for (const d of Object.keys(idx)) if (+d <= limit) {
    await db.remove('fcf_safe/daily/' + d); await db.remove('fcf_safe/index/' + d); delete idx[d];
  }
  const days = Object.keys(idx).length;
  await db.set('__backups_meta/safe', { t: ts, day: now.day, size: raw.length, days });
  write(now.day, { fcf_data, fcf_plans });
  log(`Gesichert: ${Math.round(raw.length / 1024)} KB (${Math.round(gz.length / 1024)} KB gepackt), ${days} Tage vorhanden`);
  return { ok: true, day: now.day, size: raw.length, days };
}
