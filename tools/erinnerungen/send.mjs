// Flutlicht · Erinnerungen — entry point of the scheduled GitHub workflow (players, and the trainers' own notifications, trainer.mjs)
// (.github/workflows/erinnerungen.yml): every 15 minutes, one round (round.mjs).
// Needs the secret FIREBASE_SERVICE_ACCOUNT (the project's service account
// key as JSON). Without it nothing happens. `node send.mjs --dry` sends
// nothing and writes nothing, it only lists what would go out.
import admin from 'firebase-admin';
import webpush from 'web-push';
import { round } from './round.mjs';
import { decode, pathKey, berlin, addDays, lastSession } from './lib.mjs';
import { seasonOf } from './kalender.mjs';
import { inbox, loadApply } from './eingang.mjs';
import { abend } from '../sicherung/abend.mjs';

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
  update: m => admin.database().ref().update(m),
  inc: n => admin.database.ServerValue.increment(n),
  // An inbox entry is merged once: whoever sets m first (an open trainer app does the same)
  claim: async (p, t, now) => {
    const r = await ref(p).transaction(cur => {
      if (cur === null) return null;              // not here yet: the server answers, then again
      if (cur.m || cur.t !== t) return;           // merged already, or a newer answer
      return Object.assign({}, cur, { m: now });
    });
    const v = r.committed && r.snapshot.val();
    return !!(v && v.m === now);
  },
};
try {
  // Входящие игроков (1.2.36): сначала перенести ответы, чтобы напоминания видели их
  let abwSeen = [];
  try {
    const apply = loadApply(new URL('../../index.html', import.meta.url).pathname);
    const r = await inbox({ db, apply, dry: process.argv.includes('--dry') });
    abwSeen = r.abw || [];
    const why = Object.entries(r.why).map(([k, n]) => `${k} ${n}`).join(', ');
    if (r.writes || r.healed || process.env.GITHUB_EVENT_NAME === 'workflow_dispatch')
      console.log(`::notice title=Входящие::перенесено: ${r.merged}, отклонено: ${r.refused}${why ? ' (' + why + ')' : ''}, голосов: ${r.votes} (отклонено ${r.voteRefused}), победителей опубликовано: ${r.winners}, убрано: ${r.cleaned}, неизвестных: ${r.unknown}` + (r.healed ? `, восстановлено: ${r.healed}` : '') + (r.abw && r.abw.length ? `, отсутствий: ${r.abw.length}` : ''));
  } catch (e) { console.log('::warning title=Входящие::' + String((e && e.message) || e).slice(0, 200)); }
  // KALENDER_TOKEN: GitHub token with only the "gist" scope, for the calendar feed
  const r = await round({ db, push: webpush, dry: process.argv.includes('--dry'), cal: { token: process.env.KALENDER_TOKEN || '', fetch: globalThis.fetch }, abw: abwSeen });
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
  // Вечерняя копия (1.2.113, tools/sicherung/abend.mjs): в день тренировки или
  // игры — защищённая копия примерно через 2 ч после конца, раз в день
  try {
    const now = berlin(Date.now()), season = seasonOf(now.day);
    const a = await abend({ db, season, dry: process.argv.includes('--dry'), loadSessions: async () => {
      const out = [];
      for (const t of decode(await db.get('fcf_data/teamList')) || []) {
        if (typeof t !== 'string') continue;
        out.push(decode(await db.get('fcf_data/db/' + pathKey(t + '__' + season) + '/sessions')) || []);
      }
      return out;
    } });
    if (a.ok) console.log(`::notice title=Вечерняя копия::после «${a.ev}»: ${Math.round(a.size / 1024)} КБ (${Math.round(a.gzSize / 1024)} КБ сжато), вечерних копий: ${a.days}`);
  } catch (e) { console.log('::warning title=Вечерняя копия::' + String((e && e.message) || e).slice(0, 200)); }
  // При ручном запуске: срезы игроков (только числа). GitHub показывает не больше
  // 10 аннотаций на шаг, поэтому без подробностей о данных.
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    // Срезы игроков (1.2.36): сколько, какого возраста, сколько входящих — только числа
    try {
      const pv = (await db.get('fcf_pv')) || {}, pt = (await db.get('fcf_pt')) || {}, pk = (await db.get('fcf_pk')) || {};
      const inb = (await db.get('fcf_in')) || {}, vt = (await db.get('fcf_vote')) || {};
      const ts = Object.values(pv).map(x => +x.t || 0).filter(Boolean), sz = Object.values(pv).map(x => (x.j || '').length);
      const age = t => t ? Math.round((Date.now() - t) / 60000) + ' мин' : '–';
      const ent = Object.values(inb).flatMap(o => Object.values(o || {}));
      console.log(`::notice title=Срезы::игроков: ${ts.length} (размер ${sz.length ? Math.min(...sz) + '–' + Math.max(...sz) : 0} байт, самый свежий ${age(Math.max(0, ...ts))} назад, самый старый ${age(ts.length ? Math.min(...ts) : 0)}), команд: ${Object.keys(pt).length} (${Object.values(pt).map(x => Math.round((x.j || '').length / 1024) + 'K').join(', ')}), кодов групповой ссылки: ${Object.values(pk).reduce((a, o) => a + Object.keys(o || {}).length, 0)}; входящие: ${ent.length} (перенесено ${ent.filter(e => e && e.m).length}), голосов ждёт: ${Object.values(vt).reduce((a, o) => a + Object.keys(o || {}).length, 0)}`);
    } catch (e) { console.log('::warning title=Срезы::' + String((e && e.message) || e).slice(0, 160)); }
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
    }
  }
  // Push (28.10.): what went out yesterday and today, by kind — counts only
  // (the log is public: no names, no addresses). GitHub shows at most 10
  // annotations per step, so the planner's detailed line made room for this.
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    try {
      const st = (await db.get('fcf_push/status')) || {};
      // 'chk' entries are the job's own markers (owner '_'), not notifications
      const who = o => o[0] === 'p' ? 'игр.' : o[0] === 't' ? 'трен.' : '?';
      const sum = async day => {
        const o = (await db.get(`fcf_push/sent/${day}`)) || {}, by = {}, owners = new Set();
        let n = 0;
        for (const [k, v] of Object.entries(o)) {
          const kind = k.split('-')[0];
          if (kind === 'chk') continue;
          const os = Object.keys(v || {}).filter(x => x !== '_');
          if (!os.length) continue;
          by[kind] = (by[kind] || 0) + os.length; n += os.length;
          os.forEach(x => owners.add(x));
        }
        const r = {}; for (const x of owners) r[who(x)] = (r[who(x)] || 0) + 1;
        return `${n}` + (n ? ` (${Object.entries(by).map(([k, c]) => k + ' ' + c).join(', ')}; кому: ${Object.entries(r).map(([k, c]) => c + ' ' + k).join(', ')})` : '');
      };
      const subs = (await db.get('fcf_push/subs')) || {}, ab = { p: [0, 0], t: [0, 0] };
      for (const [o, devs] of Object.entries(subs)) {
        const c = Object.values(devs || {}).filter(x => x && x.e).length;
        if (c && ab[o[0]]) { ab[o[0]][0]++; ab[o[0]][1] += c; }
      }
      const d = berlin(Date.now()).day;
      console.log(`::notice title=Push::вчера: ${await sum(addDays(d, -1))}; сегодня: ${await sum(d)}; подписаны: игроков ${ab.p[0]} (устройств ${ab.p[1]}), тренеров ${ab.t[0]} (устройств ${ab.t[1]}); ошибок в последнем прогоне: ${st.err ?? 0}, отписались: ${st.gone ?? 0}`);
    } catch (e) { console.log('::warning title=Push::' + String((e && e.message) || e).slice(0, 160)); }
  }  // Последнее событие (04.11.): the latest started session of each team —
  // attendance and ratings as counts, so a trainer's question "how did it go"
  // has an answer without opening the data
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    try {
      const now = berlin(Date.now()), season = seasonOf(now.day);
      for (const t of decode(await db.get('fcf_data/teamList')) || []) {
        if (typeof t !== 'string') continue;
        const blk = 'fcf_data/db/' + pathKey(t + '__' + season);
        const sessions = decode(await db.get(blk + '/sessions')) || [];
        const c0 = lastSession({ sessions, players: [], season, now });
        if (!c0) continue;
        const c = lastSession({ sessions, players: decode(await db.get(blk + '/players')) || [], season, now });
        console.log(`::notice title=Последнее событие ${t}::${c.match ? 'игра' : 'тренировка'} ${c.date} ${c.time}: в команде ${c.n}; был ${c.a}, не был ${c.f}, уваж. ${c.e}, не отмечено ${c.open}; нагрузку поставили ${c.rated} (сами ${c.self}, тренер ${c.coach}), «не был» ${c.nd}; открывали приложение после начала ${c.seen}; с push ${c.push}`);
      }
    } catch (e) { console.log('::warning title=Последнее событие::' + String((e && e.message) || e).slice(0, 160)); }
  }

} catch (e) {
  process.exitCode = 1;
} finally {
  await admin.app().delete();
}
