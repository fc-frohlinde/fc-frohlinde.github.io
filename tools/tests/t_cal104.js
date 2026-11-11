// 1.2.104 Kalender: Schwerpunkt 2 in eigener Zeile. node tools/tests/t_cal104.js [index.html] [shotdir]
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');
const html=HTML,out=process.argv[3]||'';let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
const prep=()=>{const D=cd();const L=[['Spielaufbau gegen hohes Pressing','Umschalten nach Ballgewinn'],['Zone 2','Standards'],['Torabschluss','']];
  let i=0;D.sessions.forEach(s=>{if(s.type==='training'){const x=L[i++%3];s.focus=x[0];if(x[1])s.focus2=x[1];else delete s.focus2;}});
  G.db['U19__rules'].wt=['Breite','Tiefe'];D.wk={w20261026:'Tiefe'};
  const h=document.getElementById('homeOverlay');if(h)h.style.display='';};
(async()=>{const b=await chromium.launch();
 for(const night of [false,true]){
  const tag=night?'nacht':'tag';
  // computer
  const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});const d=await c.newPage();await d.clock.install({time:NOW});
  d.on('pageerror',e=>{console.log('PAGEERR',e.message);fails++;});
  await d.goto('file://'+html);await d.waitForTimeout(800);
  await d.evaluate(`(${setupTrainer.toString()})({night:${night}})`);
  await d.evaluate(`(${prep.toString()})()`);
  await d.evaluate(()=>{_calCur={y:2026,m:11};hxGo('cal');});await d.waitForTimeout(300);
  const r=await d.evaluate(()=>{const es=[...document.querySelectorAll('.calx-e.t')];
    const one=es.find(e=>/Spielaufbau/.test(e.innerText));
    const l2=one&&one.querySelector('.calx-e2'),l3=one&&one.querySelector('.calx-e3');
    return {n3:document.querySelectorAll('.calx-e3').length,
      t2:l2?l2.textContent:'',t3:l3?l3.textContent:'',tip:one?one.title:'',
      fits:es.every(e=>e.scrollWidth<=e.clientWidth+1),
      noF2:!es.some(e=>/Torabschluss/.test(e.innerText)&&e.querySelector('.calx-e3'))};});
  ok(r.t2==='Spielaufbau gegen hohes Pressing'&&r.t3==='+ Umschalten nach Ballgewinn',tag+' month: first and second on their own lines');
  ok(/Spielaufbau gegen hohes Pressing \+ Umschalten nach Ballgewinn/.test(r.tip),tag+' month: tooltip has both');
  ok(r.fits&&r.noF2,tag+' month: nothing sticks out, no empty second line');
  if(out)await d.screenshot({path:out+'/d_kal104_'+tag+'.png'});
  await c.close();
  // phone
  const c2=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await c2.newPage();await p.clock.install({time:NOW});
  p.on('pageerror',e=>{console.log('PAGEERR',e.message);fails++;});
  await p.goto('file://'+html);await p.waitForTimeout(800);
  await p.evaluate(`(${setupTrainer.toString()})({night:${night}})`);
  await p.evaluate(`(${prep.toString()})()`);
  await p.evaluate(()=>hxGo('cal'));await p.waitForTimeout(300);
  // Telefon-Liste: Schwerpunkt 1 als Titel, Schwerpunkt 2 eigene, leisere Zeile (je höchstens 2 Zeilen)
  const q=await p.evaluate(()=>{const rows=[...document.querySelectorAll('.calm-r')];const one=rows.find(e=>/Spielaufbau/.test(e.innerText));
    const t=one&&one.querySelector('.hx-day-t'),f=one&&one.querySelector('.hx-day-f2');
    const ln=e=>{if(!e)return 0;const cs=getComputedStyle(e);return Math.round(e.getBoundingClientRect().height/parseFloat(cs.lineHeight));};
    const col=e=>e?getComputedStyle(e).color:'';
    return {t:t?t.textContent:'',f2:f?f.textContent:'',lt:ln(t),lf:ln(f),quiet:!!f&&col(f)!==col(t),
      wide:document.documentElement.scrollWidth<=innerWidth};});
  ok(q.t==='Spielaufbau gegen hohes Pressing'&&q.f2==='+ Umschalten nach Ballgewinn'&&q.lt<=2&&q.lf<=2&&q.quiet,tag+' phone list: second on its own quieter line, each at most two lines ('+JSON.stringify(q)+')');
  ok(q.wide,tag+' phone: page not wider than the screen');
  if(out){const el=await p.$('.calm-wk.cur');if(el)await el.screenshot({path:out+'/p_kal104_'+tag+'.png'});}
  await c2.close();
 }
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
})();
