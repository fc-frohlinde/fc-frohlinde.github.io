// 1.2.115: Hinweis in „Belastung – alle“ nennt die echte Frist (seit 1.2.90 bis
// 24 Uhr am Folgetag, höchstens bis zum nächsten Termin), nicht immer „bis 24 Uhr“.
// node tools/tests/t_rpe115.js [index.html]
const {chromium}=require('playwright');const {setupTrainer,HTML}=require('./fx.js');
let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
const at=async(b,iso)=>{const c=await b.newContext({viewport:{width:1280,height:860}});const p=await c.newPage();
  await p.clock.install({time:new Date(iso)});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+HTML);await p.waitForTimeout(600);await p.evaluate(`(${setupTrainer.toString()})({})`);
  const r=await p.evaluate(()=>{const si=cd().sessions.findIndex(s=>s.date==='Fr 06.11'&&s.type==='training');rpeAllOpen(si);
    const h=[...document.querySelectorAll('#rpe-all-body .rpe-hint')].map(x=>x.textContent).join(' | ');return {si,h};});
  await c.close();return {...r,errs};};
(async()=>{const b=await chromium.launch();
 let r=await at(b,'2026-11-06T21:30:00+01:00');
 ok(r.si>=0,'Training Fr 06.11 gefunden');
 ok(/Spieler können bis morgen 24 Uhr bewerten\./.test(r.h),'Fr 21:30: „bis morgen 24 Uhr“ ('+r.h.slice(0,60)+')');
 r=await at(b,'2026-11-07T10:00:00+01:00');
 ok(/Spieler können bis 24 Uhr bewerten\./.test(r.h)&&!/morgen/.test(r.h),'Sa 10:00: „bis 24 Uhr“');
 ok(!r.errs.length,'keine Fehler');
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);})();
