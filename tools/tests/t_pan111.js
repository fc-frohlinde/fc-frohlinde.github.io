// 1.2.111 Übersicht und Panel rechts: auf dem Laptop liegt das Panel oben drauf
// und nichts bewegt sich; Platz macht die Übersicht erst ab 1830 px (wie die Seiten).
// node tools/tests/t_pan111.js [index.html] [shotdir]
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');
const html=HTML,out=process.argv[3]||'';let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
// kleines Bild als Titelbild (2:1), damit der Foto-Streifen da ist
const HERO='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="700"><rect width="1400" height="700" fill="#2a5"/><rect y="300" width="1400" height="400" fill="#264"/></svg>').toString('base64');
async function page(b,w,h,mobile){
  const c=await b.newContext({viewport:{width:w,height:h},isMobile:!!mobile,hasTouch:!!mobile});const p=await c.newPage();await p.clock.install({time:NOW});
  const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
  await p.goto('file://'+html);await p.waitForTimeout(700);
  await p.evaluate(`(${setupTrainer.toString()})({})`);
  await p.evaluate(hr=>{G.heroPhoto=hr;const o=document.getElementById('homeOverlay');o.style.display='';hxRender();},HERO);
  await p.waitForTimeout(300);
  return {c,p,errs};
}
const geo=p=>p.evaluate(()=>{const o=document.getElementById('homeOverlay').getBoundingClientRect();const hi=document.querySelector('#hxHome .hx-heroimg');const cs=hi?getComputedStyle(hi):null;
  const sc=document.getElementById('hxHome');return {w:Math.round(o.width),r:Math.round(o.right),bs:cs?cs.backgroundSize:'',bp:cs?cs.backgroundPosition:'',h:sc.scrollHeight,
  open:document.body.classList.contains('hx-panel-open')};});
(async()=>{const b=await chromium.launch();
 // ══ Laptop 1536×730 (Full HD mit 125 %) ══
 {const {c,p,errs}=await page(b,1536,730);
  const g0=await geo(p);
  await p.evaluate(()=>openPlayerStats(3));await p.waitForTimeout(400);
  const g1=await geo(p);
  ok(g1.open,'1536: Spielerprofil offen (Panel rechts)');
  ok(g1.w===g0.w&&g1.r===g0.r,'1536: Übersicht behält ihre Breite ('+g0.w+' → '+g1.w+')');
  ok(g1.h===g0.h,'1536: Höhe unverändert, nichts bricht um ('+g0.h+' → '+g1.h+')');
  ok(g1.bs===g0.bs&&g1.bp===g0.bp,'1536: Foto unverändert ('+g1.bs+' '+g1.bp+')');
  if(out)await p.screenshot({path:out+'/pan_1536_spieler.png'});
  // links bleibt die Übersicht bedienbar: „Wer kommt?“ wechselt das Panel
  const hit=await p.evaluate(()=>{const bt=document.querySelector('#hxHome .hx-a-hero .hx-btn.primary');const r=bt.getBoundingClientRect();const el=document.elementFromPoint(r.left+10,r.top+r.height/2);return el===bt||bt.contains(el);});
  ok(hit,'1536: „Wer kommt?“ der nächsten Einheit liegt frei (nicht unter dem Panel)');
  await p.click('#hxHome .hx-a-hero .hx-btn.primary',{position:{x:10,y:10}});await p.waitForTimeout(500);
  ok(await p.evaluate(()=>document.getElementById('moSession2').classList.contains('open')&&!document.getElementById('moPlayer').classList.contains('open')),'1536: Klick daneben wechselt zum Termin');
  const g2=await geo(p);
  ok(g2.w===g0.w,'1536: auch mit dem Termin bleibt die Übersicht stehen');
  await p.keyboard.press('Escape');await p.waitForTimeout(400);
  const g3=await geo(p);
  ok(!g3.open&&g3.w===g0.w&&g3.h===g0.h,'1536: Esc schließt, Übersicht wie vorher');
  ok(!errs.length,'1536: keine Fehler');
  await c.close();}
 // ══ 1366×650 ══
 {const {c,p,errs}=await page(b,1366,650);
  const g0=await geo(p);await p.evaluate(()=>openPlayerStats(3));await p.waitForTimeout(400);const g1=await geo(p);
  ok(g1.open&&g1.w===g0.w&&g1.h===g0.h,'1366: Übersicht bleibt stehen ('+g0.w+'/'+g0.h+' → '+g1.w+'/'+g1.h+')');
  ok(!errs.length,'1366: keine Fehler');
  await c.close();}
 // ══ knapp unter 1830 px: noch oben drauf ══
 {const {c,p,errs}=await page(b,1800,900);
  const g0=await geo(p);await p.evaluate(()=>openPlayerStats(3));await p.waitForTimeout(400);const g1=await geo(p);
  ok(g1.open&&g1.w===g0.w,'1800: Panel oben drauf ('+g1.w+')');
  ok(!errs.length,'1800: keine Fehler');
  await c.close();}
 // ══ Full HD bei 100 % (1920×950): Übersicht macht Platz, Aufbau bleibt, Foto nur rechts abgeschnitten ══
 {const {c,p,errs}=await page(b,1920,950);
  const g0=await geo(p);await p.evaluate(()=>openPlayerStats(3));await p.waitForTimeout(400);const g1=await geo(p);
  ok(g1.w===g0.w-460&&g1.r===1920-460,'1920: Übersicht macht 460 px Platz ('+g0.w+' → '+g1.w+')');
  ok(g1.h<=950,'1920: passt weiter ohne Scrollen ('+g1.h+')');
  ok(/calc\(100% \+ 460px\) auto|^\d+px auto$/.test(g1.bs)&&/^0(px|%) 32%$/.test(g1.bp),'1920: Foto behält seine Größe ('+g1.bs+' '+g1.bp+')');
  const iw=await p.evaluate(()=>{const hi=document.querySelector('#hxHome .hx-heroimg');return Math.round(hi.getBoundingClientRect().width)+460;});
  ok(Math.abs(iw-g0.w)<=20,'1920: Bildbreite = Breite ohne Panel (±Scrollleiste): '+iw+' / '+g0.w);
  if(out)await p.screenshot({path:out+'/pan_1920_spieler.png'});
  ok(!errs.length,'1920: keine Fehler');
  await c.close();}
 // ══ Telefon: Panel wie bisher über die ganze Breite ══
 {const {c,p,errs}=await page(b,390,844,true);
  await p.evaluate(()=>openPlayerStats(3));await p.waitForTimeout(400);
  const w=await p.evaluate(()=>Math.round(document.querySelector('#moPlayer .mob').getBoundingClientRect().width));
  ok(w===390,'Telefon: Panel über die ganze Breite ('+w+')');
  ok(!errs.length,'Telefon: keine Fehler');
  await c.close();}
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);})();
