// Flutlicht · Zugang — binds the first admin to his own account, once.
// Every other access comes from an invite the admin makes in the app; the
// first admin cannot invite himself, so this job (service account, bypasses
// the rules) writes his invite as already redeemed plus his member entry.
// Started by hand: Actions → Zugang → Run workflow, with the account ID the
// app shows after signing in ("Konto-ID"). The invite code is never printed:
// the logs of this repository are public.
import admin from 'firebase-admin';
import crypto from 'node:crypto';

const DB_URL = 'https://fc-frohlinde-ea23f-default-rtdb.europe-west1.firebasedatabase.app';
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
const uid = String(process.env.UID_IN || '').trim();
const name = String(process.env.NAME_IN || '').trim().slice(0, 60) || 'Admin';
const fail = m => { console.log('::error title=Zugang::' + m); process.exitCode = 1; };

if (!sa) { console.log('FIREBASE_SERVICE_ACCOUNT fehlt.'); process.exit(0); }
if (!/^[A-Za-z0-9]{10,128}$/.test(uid)) { fail('ID аккаунта выглядит неправильно (только буквы и цифры).'); process.exit(); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)), databaseURL: DB_URL });
const db = admin.database();
const short = uid.slice(0, 6) + '…';
try {
  try { await admin.auth().getUser(uid); }
  catch (e) { fail('Нет аккаунта с ID ' + short + ' – сначала войти в приложении через Google или почту.'); throw null; }

  const m = (await db.ref('fcf_members/' + uid).get()).val();
  if (m && m.code) {
    const inv = (await db.ref('fcf_invites/' + m.code).get()).val();
    if (inv && inv.used === uid && !inv.revoked) {
      if (inv.role === 'admin') { console.log('::notice title=Zugang::Аккаунт ' + short + ' уже админ.'); throw null; }
      await db.ref('fcf_invites/' + m.code + '/role').set('admin');
      console.log('::notice title=Zugang::У аккаунта ' + short + ' был доступ тренера, теперь он админ.');
      throw null;
    }
  }
  const code = crypto.randomBytes(15).toString('base64url');   // 20 characters
  const now = Date.now();
  await db.ref().update({
    ['fcf_invites/' + code]: { role: 'admin', name, trainerId: '', t: now, exp: now, by: 'github', byName: 'Einrichtung', used: uid, usedAt: now },
    ['fcf_members/' + uid]: { code, t: now, name },
  });
  console.log('::notice title=Zugang::Доступ админа для ' + name + ' (аккаунт ' + short + ') создан. В приложении обновить страницу и нажать „Weiter“.');
} catch (e) {
  if (e) fail('Ошибка: ' + (e.message || e));
} finally {
  await admin.app().delete();
}
