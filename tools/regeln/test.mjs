// Flutlicht · tests of database.rules.json against the database emulator.
// Started by .github/workflows/regeln.yml: firebase emulators:exec "node test.mjs".
// Results as GitHub annotations (one line per check, failures as errors).
import fs from 'node:fs';
const NS = 'demo-flutlicht', HOST = 'http://127.0.0.1:9000';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
// The emulator accepts unsigned tokens
const token = uid => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
  iss: 'https://securetoken.google.com/' + NS, aud: NS, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  auth_time: Math.floor(Date.now() / 1000), sub: uid, user_id: uid, firebase: { sign_in_provider: 'password', identities: {} } }) + '.';
async function req(method, path, body, uid) {
  const url = HOST + '/' + path.replace(/^\//, '') + '.json?ns=' + NS + (uid && uid !== 'owner' ? '&auth=' + token(uid) : '');
  const r = await fetch(url, { method, headers: uid === 'owner' ? { Authorization: 'Bearer owner' } : {}, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: r.ok, status: r.status, body: await r.text() };
}
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('ok   ' + m); else { fails++; console.log('FAIL ' + m); console.log('::error title=Regeln::' + m); } };
const can = async (m, p) => { const r = await p; ok(r.ok, 'darf: ' + m + (r.ok ? '' : ' (' + r.status + ' ' + r.body.slice(0, 200) + ')')); };
const cannot = async (m, p) => { const r = await p; ok(!r.ok, 'darf nicht: ' + m + (r.ok ? '' : '')); };

// rules into the emulator
const rules = fs.readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8');
const rr = await fetch(HOST + '/.settings/rules.json?ns=' + NS, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rules });
const rrBody = await rr.text();
ok(rr.ok, 'Regeln geladen (' + rr.status + ')' + (rr.ok ? '' : ': ' + rrBody.slice(0, 600).replace(/\n/g, ' ')));
if (!rr.ok) process.exit(1);

const now = Date.now(), DAY = 864e5;
const inv = (o) => Object.assign({ role: 'trainer', name: 'Jimmy', trainerId: 't2', t: now, exp: now + 7 * DAY, by: 'uAdmin', byName: 'Artem' }, o);
// seed: an admin (as the bootstrap job would make it), a trainer member, invites
await req('PUT', '/', {
  fcf_data: { version: 20, teamList: ['U19'], seasonList: ['2026/27'], db: { 'U19__2026__SL__27': { players: { __arr: 1, v: [] } } } },
  fcf_invites: {
    ADMINCODE00000000001: inv({ role: 'admin', name: 'Artem', trainerId: 't1', used: 'uAdmin', usedAt: now, by: 'github', byName: 'GitHub' }),
    TRAINERCODE000000001: inv({ used: 'uTrainer', usedAt: now }),
    OPENCODE000000000001: inv({ name: 'Neu' }),
    OPENCODE000000000002: inv({ name: 'Neu2' }),
    EXPIREDCODE000000001: inv({ exp: now - 1000 }),
    REVOKEDCODE000000001: inv({ revoked: now }),
    REVOKEDUSE0000000001: inv({ used: 'uGone', usedAt: now, revoked: now })
  },
  fcf_members: {
    uAdmin: { code: 'ADMINCODE00000000001', t: now },
    uTrainer: { code: 'TRAINERCODE000000001', t: now },
    uGone: { code: 'REVOKEDUSE0000000001', t: now }
  }
}, 'owner');

// ── reading ──
await can('jeder liest eine Einladung über ihren Code', req('GET', 'fcf_invites/OPENCODE000000000001'));
await cannot('ohne Anmeldung die Liste der Einladungen lesen', req('GET', 'fcf_invites'));
await cannot('ein Trainer die Liste der Einladungen lesen', req('GET', 'fcf_invites', undefined, 'uTrainer'));
await can('der Admin die Liste der Einladungen lesen', req('GET', 'fcf_invites', undefined, 'uAdmin'));
await cannot('ohne Anmeldung die Mitglieder lesen', req('GET', 'fcf_members'));
await cannot('ein Trainer alle Mitglieder lesen', req('GET', 'fcf_members', undefined, 'uTrainer'));
await can('ein Trainer seinen eigenen Eintrag lesen', req('GET', 'fcf_members/uTrainer', undefined, 'uTrainer'));
await cannot('ein Trainer den Eintrag eines anderen lesen', req('GET', 'fcf_members/uAdmin', undefined, 'uTrainer'));
await can('der Admin alle Mitglieder lesen', req('GET', 'fcf_members', undefined, 'uAdmin'));
await cannot('ein Zurückgezogener die Liste lesen, auch als ehemaliger', req('GET', 'fcf_members', undefined, 'uGone'));

// ── making invites ──
await can('der Admin eine Einladung anlegen', req('PUT', 'fcf_invites/ADMINMADE00000000001', inv({ name: 'Tom' }), 'uAdmin'));
await cannot('ein Trainer eine Einladung anlegen', req('PUT', 'fcf_invites/TRAINERMADE000000001', inv({ name: 'Tom' }), 'uTrainer'));
await cannot('jemand ohne Zugang eine Einladung anlegen', req('PUT', 'fcf_invites/STRANGER000000000001', inv({ name: 'X' }), 'uStranger'));
await cannot('der Admin eine Einladung mit unbekannter Rolle', req('PUT', 'fcf_invites/BADROLE0000000000001', inv({ role: 'owner' }), 'uAdmin'));
await cannot('ein Trainer sich selbst zum Admin machen (Rolle der eigenen Einladung)', req('PUT', 'fcf_invites/TRAINERCODE000000001/role', 'admin', 'uTrainer'));
await cannot('ein Zurückgezogener eine Einladung anlegen', req('PUT', 'fcf_invites/GONEMADE000000000001', inv({ name: 'X' }), 'uGone'));

// ── redeeming ──
// exactly what the app writes (invAccept): server time, e-mail and the Google name
const TS = { '.sv': 'timestamp' };
const redeem = (uid, code) => req('PATCH', '/', { ['fcf_members/' + uid]: { code, t: TS, email: uid + '@x.de', name: 'Name ' + uid }, ['fcf_invites/' + code + '/used']: uid, ['fcf_invites/' + code + '/usedAt']: TS }, uid);
await cannot('ohne Anmeldung einlösen', req('PATCH', '/', { 'fcf_members/anon': { code: 'OPENCODE000000000001', t: now }, 'fcf_invites/OPENCODE000000000001/used': 'anon' }));
await cannot('nur den Mitgliedseintrag schreiben (Einladung nicht als benutzt markiert)', req('PUT', 'fcf_members/uNeu', { code: 'OPENCODE000000000001', t: Date.now() }, 'uNeu'));
await cannot('nur die Einladung als benutzt markieren', req('PUT', 'fcf_invites/OPENCODE000000000001/used', 'uNeu', 'uNeu'));
await cannot('für einen anderen einlösen', req('PATCH', '/', { 'fcf_members/uOther': { code: 'OPENCODE000000000001', t: Date.now() }, 'fcf_invites/OPENCODE000000000001/used': 'uOther' }, 'uNeu'));
await can('eine gültige Einladung einlösen', redeem('uNeu', 'OPENCODE000000000001'));
await cannot('dieselbe Einladung ein zweites Mal (anderes Konto)', redeem('uZweit', 'OPENCODE000000000001'));
await cannot('eine abgelaufene Einladung', redeem('uLate', 'EXPIREDCODE000000001'));
await cannot('eine zurückgezogene Einladung', redeem('uRev', 'REVOKEDCODE000000001'));
await cannot('mit einem erfundenen Code', redeem('uFake', 'FAKECODE000000000001'));
await cannot('ein Mitglied eine zweite Einladung für sich', redeem('uNeu', 'OPENCODE000000000002'));
await cannot('ein Mitglied seinen Eintrag ändern (anderer Code)', req('PUT', 'fcf_members/uTrainer/code', 'ADMINCODE00000000001', 'uTrainer'));
await cannot('ein Mitglied seinen Eintrag löschen und neu anlegen lassen', req('DELETE', 'fcf_members/uTrainer', undefined, 'uTrainer'));
const after = JSON.parse((await req('GET', 'fcf_invites/OPENCODE000000000001')).body || 'null');
ok(after && after.used === 'uNeu' && after.role === 'trainer', 'Einladung danach: benutzt von uNeu, Rolle unverändert');
await cannot('beim Einlösen eine fremde Rolle mitschreiben', req('PATCH', '/', { 'fcf_members/uRole': { code: 'OPENCODE000000000002', t: Date.now() }, 'fcf_invites/OPENCODE000000000002/used': 'uRole', 'fcf_invites/OPENCODE000000000002/role': 'admin' }, 'uRole'));
await can('die zweite offene Einladung danach normal einlösen', redeem('uRole', 'OPENCODE000000000002'));
await cannot('ein frisch Eingeladener (Trainer) eine Einladung anlegen', req('PUT', 'fcf_invites/NEUMADE0000000000001', inv({ name: 'X' }), 'uNeu'));

// ── managing ──
await can('der Admin die Rolle ändern (uNeu wird Admin)', req('PUT', 'fcf_invites/OPENCODE000000000001/role', 'admin', 'uAdmin'));
await can('der neue Admin liest die Mitglieder', req('GET', 'fcf_members', undefined, 'uNeu'));
await can('der Admin den Zugang zurückziehen', req('PUT', 'fcf_invites/OPENCODE000000000001/revoked', Date.now(), 'uAdmin'));
await cannot('danach ist uNeu kein Admin mehr', req('GET', 'fcf_members', undefined, 'uNeu'));
await cannot('danach legt uNeu keine Einladung mehr an', req('PUT', 'fcf_invites/NEUMADE0000000000002', inv({ name: 'X' }), 'uNeu'));
await cannot('ein Zurückgezogener die Rücknahme aufheben', req('DELETE', 'fcf_invites/OPENCODE000000000001/revoked', undefined, 'uNeu'));
await can('der Admin einen Mitgliedseintrag löschen', req('DELETE', 'fcf_members/uRole', undefined, 'uAdmin'));
await cannot('der Admin Unsinn in eine Einladung schreiben', req('PUT', 'fcf_invites/OPENCODE000000000001/foo', 1, 'uAdmin'));

// ── what stays as it is until the lock (Teil 3) ──
await can('ohne Anmeldung fcf_data lesen (noch offen)', req('GET', 'fcf_data/version'));
await can('Push-Schlüssel lesen', req('GET', 'fcf_push/pub'));
await cannot('fcf_safe lesen', req('GET', 'fcf_safe'));
await cannot('unbekannte Knoten schreiben', req('PUT', 'fremd/x', 1, 'uAdmin'));

console.log(fails ? fails + ' FAILED' : 'all passed');
console.log('::notice title=Regeln::' + (n - fails) + ' von ' + n + ' Prüfungen bestanden' + (fails ? ', ' + fails + ' FEHLER' : ''));
process.exit(fails ? 1 : 0);
