// Одноразовая диагностика входа через Google: что отвечает Firebase Auth
// для ключа приложения с разных адресов (Referer). Ключ и так открыт в коде
// страницы; секреты здесь не используются.
const KEY = 'AIzaSyANvxDo9idsZSq7syZwmCHDvbVguIjKtsY';
const P = 'fc-frohlinde-ea23f';
const out = [];
const note = s => { out.push(s); console.log(s); };
const short = s => String(s).replace(/\s+/g, ' ').slice(0, 300);
for (const ref of ['https://fc-frohlinde.github.io/', `https://${P}.firebaseapp.com/`, '']) {
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects?key=${KEY}`, { headers: ref ? { Referer: ref } : {} });
    const t = await r.text();
    let j = {}; try { j = JSON.parse(t); } catch {}
    note(`projects (Referer ${ref || 'нет'}): ${r.status} ` + (j.authorizedDomains ? 'authorizedDomains=' + j.authorizedDomains.join(',') : short(t)));
  } catch (e) { note('projects ошибка: ' + e.message); }
}
for (const path of ['/__/auth/handler', '/__/auth/iframe', '/__/firebase/init.json']) {
  try {
    const r = await fetch(`https://${P}.firebaseapp.com${path}`, { redirect: 'manual' });
    const t = await r.text();
    note(`${path}: ${r.status} ${r.headers.get('content-type') || ''} ${short(t).slice(0, 160)}`);
  } catch (e) { note(path + ' ошибка: ' + e.message); }
}
// Провайдеры, которые сервер считает включёнными (ответ createAuthUri для google.com)
try {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Referer: 'https://fc-frohlinde.github.io/' },
    body: JSON.stringify({ providerId: 'google.com', continueUri: `https://${P}.firebaseapp.com/__/auth/handler` }) });
  const t = await r.text();
  note(`createAuthUri google.com: ${r.status} ${short(t).replace(/client_id=[^&"]+/, 'client_id=…').slice(0, 220)}`);
} catch (e) { note('createAuthUri ошибка: ' + e.message); }
console.log('::notice title=Диагностика входа::' + out.join('%0A').replace(/\n/g, ' '));
