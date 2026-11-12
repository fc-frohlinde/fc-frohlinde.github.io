// 1.2.113 Daten-Backups: die Zeile der geschützten Kopie nennt auch die Abendkopie.
// node tools/tests/t_bk113.js [index.html]
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');
let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
(async()=>{const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:900}});const p=await c.newPage();await p.clock.install({time:NOW});
 const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
 await p.goto('file://'+HTML);await p.waitForTimeout(700);
 await p.evaluate(`(${setupTrainer.toString()})({})`);
 // NOW = Sa 07.11.2026 10:00 Berlin
 const line=async(safe,abend)=>p.evaluate(async([safe,abend])=>{
   window.__meta={'__backups_meta/safe':safe,'__backups_meta/safeAbend':abend};
   fbDb={ref:path=>({once:()=>Promise.resolve({val:()=>window.__meta[path]===undefined?null:window.__meta[path]})})};
   let el=document.getElementById('bk-safe');if(!el){el=document.createElement('div');el.id='bk-safe';document.body.appendChild(el);}
   el.hidden=true;el.textContent='';
   bkSafeStatus();await new Promise(r=>setTimeout(r,50));
   return {t:el.hidden?'':el.textContent,warn:el.classList.contains('warn')};},[safe,abend]);
 const t=(d,h,m)=>Date.UTC(2026,10,d,h-1,m);
 let r=await line({t:t(7,8,12),day:20261107,days:25},{t:t(6,22,7),day:20261106,days:3,ev:'Training 18:30'});
 ok(/zuletzt heute 08:12 · 25 Tage zurück\. Dazu eine Abendkopie nach Training und Spiel, zuletzt gestern 22:07\. Beide liegen außerhalb/.test(r.t)&&!r.warn,'mit Abendkopie: „… zuletzt gestern 22:07. Beide liegen …“');
 r=await line({t:t(7,8,12),day:20261107,days:25},null);
 ok(/25 Tage zurück\. Sie liegt außerhalb/.test(r.t)&&!/Abendkopie/.test(r.t),'ohne Abendkopie: wie bisher');
 r=await line({t:t(7,8,12),day:20261107,days:25},{t:t(7,8,12)-25*864e5,day:20261013,days:1});
 ok(!/Abendkopie/.test(r.t),'Abendkopie älter als 3 Wochen: nicht genannt');
 r=await line({t:t(3,8,12),day:20261103,days:25},{t:t(6,22,7),day:20261106,days:3});
 ok(r.warn&&/läuft gerade nicht\. Dazu eine Abendkopie/.test(r.t),'Tageskopie veraltet: Warnung, Abendkopie trotzdem genannt');
 r=await line(null,{t:t(6,22,7)});
 ok(r.t==='','ohne Tageskopie-Status: keine Zeile (wie bisher)');
 ok(!errs.length,'keine Fehler');
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);})();
