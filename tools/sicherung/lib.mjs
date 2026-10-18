// Flutlicht · Sicherung — the app's storage format and Berlin dates
// (same as tools/erinnerungen/lib.mjs).

// ── the app's storage format (fbEncodeValue) ──
export function decode(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && !Array.isArray(val)) {
    if (val.__media) return null;                       // photos are not needed here
    if (val.__arr === 1) {
      if (!val.v) return [];
      let arr;
      if (Array.isArray(val.v)) arr = val.v;
      else {                                            // Firebase drops nulls: rebuild by index
        const keys = Object.keys(val.v).filter(k => /^\d+$/.test(k));
        const max = keys.length ? Math.max(...keys.map(Number)) : -1;
        arr = new Array(max + 1).fill(null);
        keys.forEach(k => { arr[+k] = val.v[k]; });
      }
      return arr.map(decode);
    }
    const out = {};
    for (const k of Object.keys(val)) {
      const dk = k.replace(/__SL__/g, '/').replace(/__DOT__/g, '.').replace(/__HASH__/g, '#')
        .replace(/__LB__/g, '[').replace(/__RB__/g, ']');
      out[dk] = decode(val[k]);
    }
    return out;
  }
  if (Array.isArray(val)) return val.map(decode);
  return val;
}
export function addDays(key, n) {
  const d = new Date(Date.UTC(Math.floor(key / 10000), Math.floor(key / 100) % 100 - 1, key % 100 + n));
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
// Now in Berlin: {day: YYYYMMDD, min: minutes since midnight}
export function berlin(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return { day: +p.year * 10000 + +p.month * 100 + +p.day, min: +p.hour * 60 + +p.minute, ts };
}
