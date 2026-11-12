// Tests der Abendkopie (abend.mjs) und der Ausgabe als Datei (sicherung.mjs).
// node test_abend.mjs  — ohne Abhängigkeiten, Datenbank im Speicher.
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abend, abendFaellig, abendSichern, dayKey, ABEND_NACH, KEEP_ABEND } from './abend.mjs';
import { sichern } from './sicherung.mjs';
import { berlin } from './lib.mjs';

let fails = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
function mem(init = {}) {
  const root = JSON.parse(JSON.stringify(init));
  const seg = p => p.split('/').filter(Boolean);
  const get = p => { let o = root; for (const k of seg(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); };
  const set = (p, v) => { const s = seg(p); let o = root; for (const k of s.slice(0, -1)) { if (typeof o[k] !== 'object' || o[k] == null) o[k] = {}; o = o[k]; } if (v == null) delete o[s[s.length - 1]]; else o[s[s.length - 1]] = JSON.parse(JSON.stringify(v)); };
  const reads = [];
  return { root, reads, get: async p => { reads.push(p); return get(p); }, set: async (p, v) => set(p, v), remove: async p => set(p, null) };
}
// Berlin time → ms (November: UTC+1)
const at = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h - 1, mi);
const season = '2026/27';
const T = (date, time, extra) => Object.assign({ date, time, type: 'training' }, extra || {});
const M = (date, time, extra) => Object.assign({ date, time, type: 'match', label: 'SV Test' }, extra || {});

// ── dayKey ──
ok(dayKey('Di 10.11', season) === 20261110 && dayKey('So 03.01', season) === 20270103 && dayKey('Mo 13.7', season) === 20260713, 'dayKey: Saison Juli–Juni');

// ── fällig? ──
const tue = [[T('Di 10.11', '18:30', { duration: 90 }), T('Fr 13.11', '18:30')]];
const f = ts => abendFaellig({ sessionsList: tue, season, now: berlin(ts) });
ok(!f(at(2026, 11, 10, 19, 0)).due && !f(at(2026, 11, 10, 19, 0)).ev, 'Training läuft noch: nichts');
ok(!f(at(2026, 11, 10, 21, 59)).due && f(at(2026, 11, 10, 21, 59)).ev, 'Training 18:30–20:00, um 21:59: wartet');
ok(f(at(2026, 11, 10, 22, 0)).due && f(at(2026, 11, 10, 22, 0)).ev.label === 'Training 18:30', 'um 22:00 (2 h nach dem Ende): fällig, „Training 18:30“');
ok(!f(at(2026, 11, 11, 22, 0)).due && !f(at(2026, 11, 11, 22, 0)).ev, 'Tag ohne Termin: nichts');
ok(!f(at(2026, 11, 9, 22, 0)).ev, 'Termin morgen zählt nicht');
// ohne Dauer: Training 90, Spiel 105 Min.
const sun = [[M('So 15.11', '13:00')]];
ok(!abendFaellig({ sessionsList: sun, season, now: berlin(at(2026, 11, 15, 16, 44)) }).due
  && abendFaellig({ sessionsList: sun, season, now: berlin(at(2026, 11, 15, 16, 45)) }).due, 'Spiel 13:00 ohne Dauer: 105 Min. + 2 h → ab 16:45');
// spätes Training: Ende 21:30 — die letzten Läufe des Tages (ab 22:30) nehmen es mit
const late = [[T('Di 10.11', '20:00')]];
ok(!abendFaellig({ sessionsList: late, season, now: berlin(at(2026, 11, 10, 22, 22)) }).due
  && abendFaellig({ sessionsList: late, season, now: berlin(at(2026, 11, 10, 22, 37)) }).due, 'spätes Training (Ende 21:30): ab 22:30 fällig, nicht erst 23:30');
// zwei Mannschaften, zwei Termine: der erste, der vorbei ist
const two = [[T('Di 10.11', '17:00')], [M('Di 10.11', '19:00')]];
ok(abendFaellig({ sessionsList: two, season, now: berlin(at(2026, 11, 10, 20, 30)) }).ev.label === 'Training 17:00', 'zwei Mannschaften: der früher beendete Termin zählt');
ok(abendFaellig({ sessionsList: [[T('Di 10.11', '')]], season, now: berlin(at(2026, 11, 10, 22, 40)) }).ev === null, 'Termin ohne Uhrzeit: keine Abendkopie');

// ── schreiben ──
const data = { fcf_data: { db: { 'U19__2026__SL__27': { sessions: { __arr: 1, v: [T('Di 10.11', '18:30')] } } }, teamList: { __arr: 1, v: ['U19'] } }, fcf_plans: { U19: { lib: { a: { n: 'Rondo' } } } } };
{
  const db = mem(data);
  const ts = at(2026, 11, 10, 22, 7);
  const r = await abend({ db, ts, season, loadSessions: async () => tue });
  ok(r.ok && r.day === 20261110 && r.days === 1, 'Lauf 22:07: Abendkopie geschrieben');
  const rec = db.root.fcf_safe.abend['20261110'];
  const back = JSON.parse(zlib.gunzipSync(Buffer.from(rec.gz, 'base64')).toString('utf8'));
  ok(JSON.stringify(back) === JSON.stringify({ fcf_data: data.fcf_data, fcf_plans: data.fcf_plans }), 'Kopie = Daten und Trainingsplaner');
  ok(rec.ev === 'Training 18:30' && db.root.fcf_safe.abendIndex['20261110'].ev === 'Training 18:30', 'gespeichert, wonach: „Training 18:30“ (keine Namen)');
  const st = db.root.__backups_meta.safeAbend;
  ok(st && st.t === ts && st.day === 20261110 && st.days === 1 && !st.gz, 'Status für die App ohne die Daten selbst');
  ok(!db.root.fcf_safe.daily && !(db.root.__backups_meta.safe), 'die Tageskopie bleibt unberührt');
  // derselbe Tag: nur ein kleiner Blick, nichts Neues
  db.reads.length = 0;
  const r2 = await abend({ db, ts: ts + 15 * 60e3, season, loadSessions: async () => { throw new Error('nicht lesen'); } });
  ok(r2.skip === 'schon' && db.reads.length === 1 && db.reads[0] === 'fcf_safe/abendIndex/20261110', 'nächster Lauf: schon gemacht, liest nur den Index-Eintrag');
  // vormittags gar nichts lesen
  db.reads.length = 0;
  const r3 = await abend({ db, ts: at(2026, 11, 11, 8, 7), season, loadSessions: async () => { throw new Error('nicht lesen'); } });
  ok(r3.skip === 'früh' && db.reads.length === 0, 'vor 9 Uhr: kein Lesen');
  // Probelauf schreibt nichts
  const db2 = mem(data);
  const r4 = await abend({ db: db2, ts, season, dry: true, loadSessions: async () => tue });
  ok(r4.dry && !db2.root.fcf_safe, '--dry: nichts geschrieben');
  // wartet
  const r5 = await abend({ db: mem(data), ts: at(2026, 11, 10, 21, 0), season, loadSessions: async () => tue });
  ok(r5.skip === 'wartet', '21:00: wartet noch');
}
// leere Daten: kein Schreiben
{
  const db = mem({ fcf_data: { teamList: ['U19'] } });
  let err = '';
  try { await abend({ db, ts: at(2026, 11, 10, 22, 7), season, loadSessions: async () => tue }); } catch (e) { err = e.message; }
  ok(/leer/.test(err) && !db.root.fcf_safe, 'fcf_data ohne db: Fehler, nichts überschrieben');
}
// nach KEEP_ABEND Tagen weg
{
  const db = mem(data);
  db.root.fcf_safe = { abend: { 20261011: { gz: 'x' }, 20261012: { gz: 'y' } }, abendIndex: { 20261011: { t: 1 }, 20261012: { t: 2 } } };
  const r = await abendSichern({ db, ts: at(2026, 11, 10, 22, 7), ev: 'Training 18:30' });
  ok(!db.root.fcf_safe.abend['20261011'] && db.root.fcf_safe.abend['20261012'] && r.days === 2, KEEP_ABEND + ' Tage (heute + 29): 11.10. gelöscht, 12.10. bleibt');
}
// ── als Datei ausgeben (Workflow „Sicherung“, Datum JJJJMMTT-abend) ──
{
  const db = mem(data);
  await abendSichern({ db, ts: at(2026, 11, 10, 22, 7), ev: 'Training 18:30' });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'abend-'));
  const logs = [];
  const r = await sichern({ db, datum: '20261110-abend', outDir: out, log: m => logs.push(m) });
  const files = fs.readdirSync(out).sort();
  ok(r.ok && files.join() === 'LIESMICH.txt,flutlicht-20261110-abend.json,trainingsplaner-20261110-abend.json', 'Datum „20261110-abend“: Dateien der Abendkopie');
  ok(/10\.11\.2026 \(Abendkopie nach Training\/Spiel\)/.test(fs.readFileSync(path.join(out, 'LIESMICH.txt'), 'utf8')), 'LIESMICH nennt die Abendkopie');
  const G = JSON.parse(fs.readFileSync(path.join(out, 'flutlicht-20261110-abend.json'), 'utf8'));
  ok(Array.isArray(G.teamList) && G.teamList[0] === 'U19', 'Datei im Format der App (decodiert)');
  const r2 = await sichern({ db, datum: '20261111-abend', outDir: out, log: m => logs.push(m) });
  ok(!r2.ok && /Abendkopien: 20261110-abend/.test(logs[logs.length - 1]), 'fehlender Tag: nennt die vorhandenen Abendkopien');
  // die nächtliche Kopie schreibt weiter nur ihre eigenen Knoten
  const r3 = await sichern({ db, ts: at(2026, 11, 11, 3, 23), outDir: out, log: () => {} });
  ok(r3.ok && db.root.fcf_safe.daily['20261111'] && db.root.fcf_safe.abend['20261110'] && db.root.__backups_meta.safeAbend, 'Tageskopie danach: Abendkopie und ihr Status bleiben');
}
console.log(fails ? fails + ' von ' + n + ' FEHLGESCHLAGEN' : 'alle ' + n + ' bestanden');
process.exit(fails ? 1 : 0);
