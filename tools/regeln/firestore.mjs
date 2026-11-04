// Flutlicht · Firestore — the app does not use Cloud Firestore (its data is
// in the Realtime Database). A Firestore database "(default)" was created in
// test mode when the project was set up; its rules ran out after 30 days and
// since then every client request is refused, and Firebase sends reminder
// e-mails. This job looks (counts only, no names) and, with "sperren",
// publishes rules that say so explicitly: nobody, ever.
import admin from 'firebase-admin';

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
const lock = String(process.env.SPERREN || '') === 'true';
const note = m => console.log('::notice title=Firestore::' + m);
const fail = m => { console.log('::error title=Firestore::' + m); process.exitCode = 1; };
const RULES = `rules_version = '2';
// Flutlicht nutzt Cloud Firestore nicht (Daten in der Realtime Database).
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`;
if (!sa) { console.log('FIREBASE_SERVICE_ACCOUNT fehlt.'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
try {
  try {
    const cols = await admin.firestore().listCollections();
    let docs = 0;
    for (const c of cols) docs += (await c.count().get()).data().count;
    note('Коллекций: ' + cols.length + ', документов: ' + docs + ' (имена не выводятся).');
  } catch (e) { note('Данные не прочитать: ' + String(e.message || e).slice(0, 160)); }
  try {
    const rs = await admin.securityRules().getFirestoreRuleset();
    const src = (rs.source && rs.source[0] && rs.source[0].content) || '';
    const test = /request\.time\s*</.test(src), closed = /allow\s+read\s*,\s*write\s*:\s*if\s+false/.test(src);
    note('Текущие правила: ' + (closed ? 'закрыто для всех' : test ? 'тестовый режим с датой окончания' : 'другие') + ' (создан набор ' + (rs.createTime || '?') + ').');
  } catch (e) { note('Правила не прочитать: ' + String(e.message || e).slice(0, 160)); }
  if (lock) {
    const r = await admin.securityRules().releaseFirestoreRulesetFromSource(RULES);
    note('Опубликованы правила «никому, никогда» (набор ' + (r.name || '').split('/').pop() + ').');
  } else note('Только проверка. Закрыть — запуск с «sperren».');
} catch (e) {
  fail('Ошибка: ' + String((e && e.message) || e).slice(0, 200));
} finally {
  await admin.app().delete();
}
