// Flutlicht · Erinnerungen — entry point of the scheduled GitHub workflow (players, and the trainers' own notifications, trainer.mjs)
// (.github/workflows/erinnerungen.yml): every 15 minutes, one round (round.mjs).
// Needs the secret FIREBASE_SERVICE_ACCOUNT (the project's service account
// key as JSON). Without it nothing happens. `node send.mjs --dry` sends
// nothing and writes nothing, it only lists what would go out.
import admin from 'firebase-admin';
import webpush from 'web-push';
import { round } from './round.mjs';
import { decode, pathKey, berlin } from './lib.mjs';
import { seasonOf } from './kalender.mjs';

const DB_URL = 'https://fc-frohlinde-ea23f-default-rtdb.europe-west1.firebasedatabase.app';
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) {
  console.log('FIREBASE_SERVICE_ACCOUNT fehlt – Erinnerungen sind noch nicht eingerichtet.');
  process.exit(0);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)), databaseURL: DB_URL });
const ref = p => admin.database().ref(p);
const db = {
  get: async p => (await ref(p).get()).val(),
  set: (p, v) => ref(p).set(v),
  remove: p => ref(p).remove(),
};
try {
  // KALENDER_TOKEN: GitHub token with only the "gist" scope, for the calendar feed
  const r = await round({ db, push: webpush, dry: process.argv.includes('--dry'), cal: { token: process.env.KALENDER_TOKEN || '', fetch: globalThis.fetch } });
  // Состояние календаря — одной аннотацией, без адреса (лог публичный)
  const c = r && r.cal;
  if (c) {
    const urls = Object.keys((await db.get('fcf_cal')) || {}).length;
    const when = c.t ? new Date(c.t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'ещё не было';
    console.log('::notice title=Календарь::' + (c.off ? 'нет секрета KALENDER_TOKEN, календарь не публикуется'
      : `команд: ${c.n || 0}, адресов в fcf_cal: ${urls}, последняя публикация: ${when}` + (c.err ? `, ошибка: ${c.err}` : '')));
    // При ручном запуске: скачать каждую ленту так, как это делает календарь
    if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
      for (const [k, v] of Object.entries((await db.get('fcf_cal')) || {})) {
        try {
          const res = await fetch(v.url), txt = await res.text();
          const ev = (txt.match(/^BEGIN:VEVENT/gm) || []).length, ok = /^BEGIN:VCALENDAR/.test(txt) && /END:VCALENDAR\s*$/.test(txt);
          const m = (txt.match(/^UID:.*-m-/gm) || []).length, tp = (txt.match(/^DESCRIPTION:.*Treffpunkt/gm) || []).length;
          console.log(`::notice title=Лента ${k}::HTTP ${res.status}, ${ok ? 'формат в порядке' : 'формат НЕ в порядке'}, событий: ${ev} (игр: ${m}, с Treffpunkt: ${tp}), ${txt.length} байт`);
          // Сколько игр сезона вообще имеют состав (только числа)
          if (v.team) {
            const raw = (await db.get('fcf_data/db/' + pathKey(v.team + '__' + seasonOf(berlin(Date.now()).day)) + '/sessions')) || null;
            const list = decode(raw) || [];
            const ms = list.filter(x => x && x.type === 'match'), sq = ms.filter(x => x.squad && typeof x.squad === 'object');
            console.log(`::notice title=Составы ${k}::игр в сезоне: ${ms.length}, с составом: ${sq.length}, опубликовано: ${sq.filter(x => typeof x.squad.t === 'number' && !x.squad.off).length}, с Treffpunkt: ${sq.filter(x => x.squad.meet).length}, отозвано: ${sq.filter(x => x.squad.off).length}`);
          }
        } catch (e) { console.log(`::warning title=Лента ${k}::не скачать: ${String((e && e.message) || e).slice(0, 120)}`); }
      }
    }
  }
  // При ручном запуске: как устроены данные игроков (только названия полей и числа, без значений) —
  // для срезов игроков (часть 2)
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    try {
      const top = (await db.get('fcf_data')) || {};
      const sz = v => JSON.stringify(v == null ? null : v).length;
      console.log('::notice title=Данные: узлы::' + Object.keys(top).sort().map(k => `${k} ${Math.round(sz(top[k]) / 1024)}K`).join(', '));
      const dbk = Object.keys(top.db || {});
      console.log('::notice title=Данные: db::' + dbk.map(k => { const d = k.replace(/__SL__/g, '/').replace(/__DOT__/g, '.'); return `${d} ${Math.round(sz(top.db[k]) / 1024)}K`; }).join(', '));
      for (const k of dbk) {
        const blk = decode(top.db[k]);
        if (!blk || !Array.isArray(blk.players)) continue;
        const name = k.replace(/__SL__/g, '/').replace(/__DOT__/g, '.');
        const pl = blk.players.filter(p => p && typeof p === 'object'), cnt = {};
        pl.forEach(p => Object.keys(p).forEach(f => { cnt[f] = (cnt[f] || 0) + 1; }));
        const se = (blk.sessions || []).filter(s => s && typeof s === 'object'), sc = {};
        se.forEach(s => Object.keys(s).forEach(f => { sc[f] = (sc[f] || 0) + 1; }));
        const raw = top.db[k], rawPl = raw && raw.players;
        console.log(`::notice title=Игроки ${name}::игроков: ${pl.length}, с кодом ссылки: ${pl.filter(p => p.confirmToken).length}, с датой рождения: ${pl.filter(p => p.birthdate).length}, с фото: ${pl.filter((p, i) => p.photo || p._mid_photo || (rawPl && ((rawPl.v || rawPl)[i] || {}).photo)).length}; размер игроков ${Math.round(sz(rawPl) / 1024)}K, событий ${se.length} (${Math.round(sz(raw && raw.sessions) / 1024)}K); поля блока: ${Object.keys(blk).sort().join(' ')}`);
        console.log(`::notice title=Поля игроков ${name}::` + Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', '));
        console.log(`::notice title=Поля событий ${name}::` + Object.entries(sc).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', '));
      }
    } catch (e) { console.log('::warning title=Данные::' + String((e && e.message) || e).slice(0, 160)); }
  }
  // При ручном запуске: сколько всего в планировщике (только числа)
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    const teams = decode(await db.get('fcf_data/teamList')) || [];
    for (const t of teams) {
      if (typeof t !== 'string') continue;
      const k = t.replace(/\//g, '__SL__').replace(/\./g, '__DOT__').replace(/[#$\[\]]/g, '_');
      const n = async x => Object.keys((await db.get(`fcf_plans/${k}/${x}`)) || {}).length;
      const std = await db.get(`fcf_plans/${k}/std`);
      console.log(`::notice title=Планировщик ${t}::упражнений в библиотеке: ${await n('lib')}, планов: ${await n('plans')}, шаблонов: ${await n('tpl')}, свой стандарт: ${std ? 'да' : 'нет'}`);
      const arr = x => Array.isArray(x) ? x.filter(Boolean) : (x && typeof x === 'object' ? Object.values(x).filter(Boolean) : []);
      const plans = (await db.get(`fcf_plans/${k}/plans`)) || {}, idx = (await db.get(`fcf_plans/${k}/idx`)) || {};
      const pb = Object.values(plans).map(p => arr(p && p.blocks).length);
      const sr = std ? arr(std.rows) : [];
      console.log(`::notice title=Планировщик ${t} подробно::блоков в планах: ${pb.join(', ') || '–'}; в сводках n: ${Object.values(idx).map(x => x && x.n).join(', ') || '–'}; стандарт: строк ${sr.length}, с названием ${sr.filter(r => r && r.ph).length}, минут ${sr.reduce((a, r) => a + (+(r && r.min) || 0), 0)}`);
    }
  }
} catch (e) {
  process.exitCode = 1;
} finally {
  await admin.app().delete();
}
