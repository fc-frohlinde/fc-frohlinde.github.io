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
const can = async (m, p) => { const r = await p; ok(r.ok, 'можно: ' + m + (r.ok ? '' : ' (' + r.status + ' ' + r.body.slice(0, 200) + ')')); };
const cannot = async (m, p) => { const r = await p; ok(!r.ok, 'нельзя: ' + m + (r.ok ? '' : '')); };

// rules into the emulator
const rules = fs.readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8');
const rr = await fetch(HOST + '/.settings/rules.json?ns=' + NS, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rules });
const rrBody = await rr.text();
ok(rr.ok, 'правила загружены (' + rr.status + ')' + (rr.ok ? '' : ': ' + rrBody.slice(0, 600).replace(/\n/g, ' ')));
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
await can('любой читает приглашение по его коду', req('GET', 'fcf_invites/OPENCODE000000000001'));
await cannot('без входа читать список приглашений', req('GET', 'fcf_invites'));
await cannot('тренеру читать список приглашений', req('GET', 'fcf_invites', undefined, 'uTrainer'));
await can('админу читать список приглашений', req('GET', 'fcf_invites', undefined, 'uAdmin'));
await cannot('без входа читать участников', req('GET', 'fcf_members'));
await cannot('тренеру читать всех участников', req('GET', 'fcf_members', undefined, 'uTrainer'));
await can('тренеру читать свою запись', req('GET', 'fcf_members/uTrainer', undefined, 'uTrainer'));
await cannot('тренеру читать чужую запись', req('GET', 'fcf_members/uAdmin', undefined, 'uTrainer'));
await can('админу читать всех участников', req('GET', 'fcf_members', undefined, 'uAdmin'));
await cannot('отозванному читать список, даже бывшему админу', req('GET', 'fcf_members', undefined, 'uGone'));

// ── making invites ──
await can('админу создать приглашение', req('PUT', 'fcf_invites/ADMINMADE00000000001', inv({ name: 'Tom' }), 'uAdmin'));
await cannot('тренеру создать приглашение', req('PUT', 'fcf_invites/TRAINERMADE000000001', inv({ name: 'Tom' }), 'uTrainer'));
await cannot('кому-то без доступа создать приглашение', req('PUT', 'fcf_invites/STRANGER000000000001', inv({ name: 'X' }), 'uStranger'));
await cannot('админу создать приглашение с неизвестной ролью', req('PUT', 'fcf_invites/BADROLE0000000000001', inv({ role: 'owner' }), 'uAdmin'));
await cannot('тренеру сделать себя админом (роль своего приглашения)', req('PUT', 'fcf_invites/TRAINERCODE000000001/role', 'admin', 'uTrainer'));
await cannot('отозванному создать приглашение', req('PUT', 'fcf_invites/GONEMADE000000000001', inv({ name: 'X' }), 'uGone'));

// ── redeeming ──
// exactly what the app writes (invAccept): server time, e-mail and the Google name
const TS = { '.sv': 'timestamp' };
const redeem = (uid, code) => req('PATCH', '/', { ['fcf_members/' + uid]: { code, t: TS, email: uid + '@x.de', name: 'Name ' + uid }, ['fcf_invites/' + code + '/used']: uid, ['fcf_invites/' + code + '/usedAt']: TS }, uid);
await cannot('активировать без входа', req('PATCH', '/', { 'fcf_members/anon': { code: 'OPENCODE000000000001', t: now }, 'fcf_invites/OPENCODE000000000001/used': 'anon' }));
await cannot('записать только участника (приглашение не помечено использованным)', req('PUT', 'fcf_members/uNeu', { code: 'OPENCODE000000000001', t: Date.now() }, 'uNeu'));
await cannot('только пометить приглашение использованным', req('PUT', 'fcf_invites/OPENCODE000000000001/used', 'uNeu', 'uNeu'));
await cannot('активировать за другого', req('PATCH', '/', { 'fcf_members/uOther': { code: 'OPENCODE000000000001', t: Date.now() }, 'fcf_invites/OPENCODE000000000001/used': 'uOther' }, 'uNeu'));
await can('активировать действующее приглашение', redeem('uNeu', 'OPENCODE000000000001'));
await cannot('то же приглашение второй раз (другой аккаунт)', redeem('uZweit', 'OPENCODE000000000001'));
await cannot('истёкшее приглашение', redeem('uLate', 'EXPIREDCODE000000001'));
await cannot('отозванное приглашение', redeem('uRev', 'REVOKEDCODE000000001'));
await cannot('с выдуманным кодом', redeem('uFake', 'FAKECODE000000000001'));
await cannot('участнику второе приглашение для себя', redeem('uNeu', 'OPENCODE000000000002'));
await cannot('участнику изменить свою запись (другой код)', req('PUT', 'fcf_members/uTrainer/code', 'ADMINCODE00000000001', 'uTrainer'));
await cannot('участнику удалить свою запись', req('DELETE', 'fcf_members/uTrainer', undefined, 'uTrainer'));
const after = JSON.parse((await req('GET', 'fcf_invites/OPENCODE000000000001')).body || 'null');
ok(after && after.used === 'uNeu' && after.role === 'trainer', 'приглашение после этого: использовано uNeu, роль не изменилась');
await cannot('при активации дописать чужую роль', req('PATCH', '/', { 'fcf_members/uRole': { code: 'OPENCODE000000000002', t: Date.now() }, 'fcf_invites/OPENCODE000000000002/used': 'uRole', 'fcf_invites/OPENCODE000000000002/role': 'admin' }, 'uRole'));
await can('после этого обычно активировать второе открытое приглашение', redeem('uRole', 'OPENCODE000000000002'));
await cannot('только что приглашённому тренеру создать приглашение', req('PUT', 'fcf_invites/NEUMADE0000000000001', inv({ name: 'X' }), 'uNeu'));

// ── managing ──
await can('админу изменить роль (uNeu становится админом)', req('PUT', 'fcf_invites/OPENCODE000000000001/role', 'admin', 'uAdmin'));
await can('новый админ читает участников', req('GET', 'fcf_members', undefined, 'uNeu'));
await can('админу отозвать доступ', req('PUT', 'fcf_invites/OPENCODE000000000001/revoked', Date.now(), 'uAdmin'));
await cannot('после этого uNeu больше не админ', req('GET', 'fcf_members', undefined, 'uNeu'));
await cannot('после этого uNeu не создаёт приглашений', req('PUT', 'fcf_invites/NEUMADE0000000000002', inv({ name: 'X' }), 'uNeu'));
await cannot('отозванному отменить отзыв', req('DELETE', 'fcf_invites/OPENCODE000000000001/revoked', undefined, 'uNeu'));
await can('админу удалить запись участника', req('DELETE', 'fcf_members/uRole', undefined, 'uAdmin'));
await cannot('админу записать мусор в приглашение', req('PUT', 'fcf_invites/OPENCODE000000000001/foo', 1, 'uAdmin'));

// ── Kalender-Abo: the feed address, members only ──
await req('PUT', 'fcf_cal', { U19: { url: 'https://gist.githubusercontent.com/x/y/raw/f.ics', team: 'U19', t: now } }, 'owner');
await can('тренеру с аккаунтом читать адрес календаря', req('GET', 'fcf_cal/U19', undefined, 'uTrainer'));
await can('админу читать адрес календаря', req('GET', 'fcf_cal', undefined, 'uAdmin'));
await cannot('без входа читать адрес календаря', req('GET', 'fcf_cal/U19'));
await cannot('чужому аккаунту (не участник) читать адрес календаря', req('GET', 'fcf_cal/U19', undefined, 'uStranger'));
await cannot('отозванному читать адрес календаря', req('GET', 'fcf_cal/U19', undefined, 'uGone'));
await cannot('админу записать адрес календаря (только джоб)', req('PUT', 'fcf_cal/U19/url', 'https://evil', 'uAdmin'));

// ── what stays as it is until the lock (Teil 3) ──
await can('без входа читать fcf_data (пока открыто)', req('GET', 'fcf_data/version'));
await can('читать push-ключ', req('GET', 'fcf_push/pub'));
await cannot('читать fcf_safe', req('GET', 'fcf_safe'));
await cannot('писать в неизвестные узлы', req('PUT', 'fremd/x', 1, 'uAdmin'));

console.log(fails ? fails + ' FAILED' : 'all passed');
console.log('::notice title=Regeln::' + (n - fails) + ' из ' + n + ' проверок пройдено' + (fails ? ', ОШИБОК: ' + fails : ''));
process.exit(fails ? 1 : 0);
