// 1.2.114 Spieler des Monats. node tools/tests/t_som114.js [index.html] [shotdir]
// Vorschlag (Training zuerst, dann ▲ und Spieler des Spiels), Wahl/Zurücknehmen,
// „Im Blick“, was im Teil der Mannschaft steht (keine Zahlen, Foto nur mit
// Einwilligung), Übersicht und Karte der Spieler, Nur-Lesen ohne Knopf.
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');
const out=process.argv[3]||'';let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
const txt=(d,sel)=>d.evaluate(s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\s+/g,' ').trim():'';},sel);
const IMG=()=>{const c=document.createElement('canvas');c.width=c.height=120;const x=c.getContext('2d');x.fillStyle='#3a6';x.fillRect(0,0,120,120);x.fillStyle='#fff';x.beginPath();x.arc(60,50,26,0,7);x.fill();x.fillRect(25,80,70,40);return c.toDataURL('image/png');};
// October: everybody misses one training except Finn Wolf (▲ 2), Ali Kaya
// (▲ 1, Spieler des Spiels 1×) and Tom Berg (▲ 1, ▼ 1); Jonas Kraus misses four.
function october(){
  const D=cd(),S=D.sessions;
  const oct=S.map((s,si)=>({s,si})).filter(x=>/\.10$/.test(x.s.date));
  const tr=oct.filter(x=>x.s.type==='training').map(x=>x.si),ma=oct.filter(x=>x.s.type==='match').map(x=>x.si);
  D.players.forEach((p,pi)=>{
    p.perf=p.perf||[];
    oct.forEach(({si})=>{p.s[si]=1;p.perf[si]=null;});
    if(![4,1,2].includes(pi))p.s[tr[pi%tr.length]]=0;
    if(pi===7){p.s[tr[1]]=0;p.s[tr[2]]=2;p.s[tr[3]]=0;}
  });
  const P=D.players;
  P[4].perf[tr[0]]=1;P[4].perf[tr[3]]=1;
  P[1].perf[tr[1]]=1;
  P[2].perf[tr[2]]=1;P[2].perf[tr[4]]=3;
  S[ma[1]].mvpWin=['Ali Kaya'];
  return {nT:tr.length,nS:ma.length};
}
(async()=>{const b=await chromium.launch();
 // ══ trainers ══
 const c=await b.newContext({viewport:{width:1440,height:900}});const d=await c.newPage();await d.clock.install({time:NOW});
 const errs=[];d.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
 await d.goto('file://'+HTML);await d.waitForTimeout(700);
 await d.evaluate(`(${setupTrainer.toString()})({})`);
 const cnt=await d.evaluate(`(${october.toString()})()`);
 ok(cnt.nT===9&&cnt.nS===4,'Oktober in den Testdaten: 9 Trainings, 4 Spiele');
 // the suggestion
 const C=await d.evaluate(()=>_somCands(cd(),'2026/27','2026-10').rows.map(r=>[r.p.name,_somFacts(r)]));
 ok(C[0][0]==='Finn Wolf'&&C[1][0]==='Ali Kaya'&&C[2][0]==='Tom Berg','Vorschlag: volle Trainings zuerst, dann ▲ (Finn ▲2, Ali ▲1 + Spieler des Spiels, Tom ▲1 ▼1)');
 ok(C[0][1]==='Training 9 von 9 · 4 Spiele · ▲ 2'&&C[1][1]==='Training 9 von 9 · 4 Spiele · ▲ 1 · Spieler des Spiels 1×'&&C[2][1]==='Training 9 von 9 · 4 Spiele · ▲ 1 · ▼ 1','Zahlen für die Trainer: „Training 9 von 9 · 4 Spiele · ▲ 2“');
 ok(C[C.length-1][0]==='Jonas Kraus'&&/Training 5 von 9/.test(C[C.length-1][1]),'vier Mal gefehlt (einmal entschuldigt): ganz unten, „Training 5 von 9“');
 ok(C.length===15,'alle 15 Spieler in der Liste');
 const nov=await d.evaluate(()=>_somCands(cd(),'2026/27','2026-11'));
 ok(nov.nT===2&&nov.nS===1,'November bis Sa 07.11.: 2 Trainings, 1 Spiel (nur was stattgefunden hat)');
 // Im Blick
 await d.evaluate(()=>hxRender());
 let fl=await d.evaluate(()=>(window._hxFlagsList||[]).filter(f=>f.who==='Spieler des Monats').map(f=>[f.what,f.on]));
 ok(fl.length===1&&fl[0][0]==='Oktober – noch nicht gewählt'&&fl[0][1]==="somOpen('2026-10')",'Im Blick: „Spieler des Monats · Oktober – noch nicht gewählt“');
 // Statistik
 await d.evaluate(()=>{hxGo('stats');});await d.waitForTimeout(400);
 const card=await txt(d,'#db-content .som-card');
 ok(/Spieler des Monats/.test(card)&&/November\s*noch nicht gewählt/.test(card)&&/Oktober\s*noch nicht gewählt/.test(card)&&/wählen/.test(card),'Statistik: Karte mit den letzten Monaten und dem Knopf');
 const order=await d.evaluate(()=>{const h=[...document.querySelectorAll('#db-content > *')].map(x=>x.className);return [h.findIndex(c=>/sbi-top/.test(c)),h.findIndex(c=>/som-card/.test(c)),h.findIndex(c=>/db-alltab/.test(c))];});
 ok(order[0]>=0&&order[0]<order[1]&&order[1]<order[2],'Statistik: unter der oberen Reihe, über „Alle Spieler“');
 // the dialog
 await d.click('.som-go');await d.waitForTimeout(200);
 ok(await d.evaluate(()=>document.getElementById('som-m').value)==='2026-10','Dialog öffnet auf Oktober (der letzte fertige Monat ohne Wahl)');
 const dl=await txt(d,'#som-b');
 ok(/Oktober: 9 Trainings, 4 Spiele/.test(dl)&&/keine Zahlen/.test(dl)&&/Alle 15 Spieler zeigen/.test(dl),'Dialog: Monat, Erklärung, Hinweis „keine Zahlen“, „Alle 15 Spieler zeigen“');
 ok(await d.evaluate(()=>document.querySelectorAll('#som-b .som-r:not([hidden])').length)===6,'sechs Vorschläge sichtbar');
 ok(await d.evaluate(()=>document.getElementById('som-ok').disabled),'„Bekanntgeben“ erst nach der Wahl');
 ok(/November 2026 \(läuft noch\)/.test(await d.evaluate(()=>[...document.querySelectorAll('#som-m option')].map(o=>o.textContent).join('|'))),'der laufende Monat ist als „läuft noch“ markiert');
 await d.click('.som-more');
 ok(await d.evaluate(()=>document.querySelectorAll('#som-b .som-r:not([hidden])').length)===15,'„Alle Spieler zeigen“: alle 15');
 if(out){await d.evaluate(()=>{document.querySelectorAll('#som-b .som-x').forEach(x=>x.hidden=true);});await d.check('#som-b input[value="Finn Wolf"]');await d.fill('#som-why','Bei jedem Training da und zweimal richtig stark');await d.locator('#moSom .mob').screenshot({path:out+'/t_som_dialog.png'});}
 await d.check('#som-b input[value="Finn Wolf"]');
 await d.fill('#som-why','Bei jedem Training da und zweimal richtig stark');
 ok(!(await d.evaluate(()=>document.getElementById('som-ok').disabled)),'nach der Wahl: Knopf aktiv');
 const undo0=await d.evaluate(()=>(typeof undoStack!=='undefined'&&undoStack.length)||0);
 await d.click('#som-ok');await d.waitForTimeout(250);
 const st=await d.evaluate(()=>({...G.db['U19__som'],_now:Date.now()}));
 ok(st&&st['2026-10']&&st['2026-10'].n==='Finn Wolf'&&st['2026-10'].why==='Bei jedem Training da und zweimal richtig stark'&&Math.abs(st['2026-10'].t-st._now)<6e4&&st['2026-10'].by==='Admin','gespeichert: {n, why, t, by} unter U19__som / 2026-10');
 ok(await d.evaluate(()=>G.auditLog.some(a=>a.action==='Spieler des Monats'&&/Oktober 2026/.test(JSON.stringify(a)))),'Protokoll: „Spieler des Monats … Oktober 2026“');
 ok(await d.evaluate(()=>TEAM_WIDE_KEYS.includes('som')),'gilt für die Mannschaft, nicht nur für die Saison (TEAM_WIDE_KEYS)');
 if(undo0!==undefined)ok(await d.evaluate(n=>typeof undoStack==='undefined'||undoStack.length>n,undo0),'rückgängig machbar (snap)');
 ok(!(await d.evaluate(()=>document.getElementById('moSom').classList.contains('open'))),'Dialog zu');
 const card2=await txt(d,'#db-content .som-card');
 ok(/Oktober\s*Finn Wolf\s*„Bei jedem Training da und zweimal richtig stark“/.test(card2),'Statistik zeigt Finn Wolf mit dem Satz');
 if(out)await d.locator('#db-content .som-card').screenshot({path:out+'/t_som_statistik.png'});
 await d.evaluate(()=>hxRender());
 fl=await d.evaluate(()=>(window._hxFlagsList||[]).filter(f=>f.who==='Spieler des Monats').length);
 ok(fl===0,'Im Blick: nach der Wahl weg');
 // reopen: chosen one checked, „Speichern“, „Zurücknehmen“
 await d.evaluate(()=>somOpen('2026-10'));await d.waitForTimeout(150);
 ok(await d.evaluate(()=>document.querySelector('#som-b input[value="Finn Wolf"]').checked)&&/Speichern/.test(await txt(d,'#som-ok'))&&/Zurücknehmen/.test(await txt(d,'#som-b'))&&/Gewählt: Finn Wolf/.test(await txt(d,'#som-b')),'wieder offen: Finn gewählt, „Speichern“, „Zurücknehmen“');
 await d.evaluate(()=>closeM('moSom'));

 // ══ what goes to the players ══
 await d.evaluate(`(()=>{const im=(${IMG.toString()})();const P=cd().players;P[4].photo=im;P[2].photo=im;})()`);
 let sl=await d.evaluate(()=>{const r=_pvBuildSync('U19','2026/27');const me=r.people.find(x=>x.pi===4),o=r.people.find(x=>x.pi===2);return {som:r.shared.som,me:me.obj.me.somW||null,o:o.obj.me.somW||null};});
 ok(sl.som&&sl.som.m==='2026-10'&&sl.som.n==='Finn Wolf'&&sl.som.why==='Bei jedem Training da und zweimal richtig stark'&&sl.som.ph===null,'Teil der Mannschaft: Monat, Name, Satz – ohne Foto, solange er es nicht erlaubt hat');
 ok(Object.keys(sl.som).sort().join(',')==='m,n,ph,t,why'&&!/von \d|▲|▼|Spiele/.test(JSON.stringify(sl.som)),'keine Zahlen im Teil der Mannschaft');
 ok(JSON.stringify(sl.me)==='["2026-10"]'&&sl.o===null,'eigener Teil: nur der Gewählte bekommt seine Monate (somW)');
 await d.evaluate(()=>{cd().players[4].fotoOk={v:1,t:Date.now()};});
 sl=await d.evaluate(()=>_pvBuildSync('U19','2026/27').shared.som);
 ok(sl.ph&&/^data:image/.test(sl.ph),'mit Einwilligung: sein Foto dabei');
 await d.evaluate(()=>{G.db['U19__som']['2026-10'].t=Date.now()-15*864e5;});
 ok(await d.evaluate(()=>_pvBuildSync('U19','2026/27').shared.som===null),'nach zwei Wochen: nicht mehr im Teil der Mannschaft');
 await d.evaluate(()=>{G.db['U19__som']['2026-10'].t=Date.now();});

 // take it back
 await d.evaluate(()=>somOpen('2026-10'));await d.waitForTimeout(100);
 await d.click('.som-del');await d.waitForTimeout(200);
 ok(await d.evaluate(()=>!G.db['U19__som']['2026-10']&&window.__dl.some(m=>/zurücknehmen\?/.test(m))),'Zurücknehmen: mit Rückfrage, dann weg');
 ok(await d.evaluate(()=>_pvBuildSync('U19','2026/27').shared.som===null),'zurückgenommen: die Spieler sehen nichts mehr');
 // viewer: no button, no flag
 await d.evaluate(()=>{G.db['U19__som']={'2026-10':{n:'Finn Wolf',why:'',t:Date.now(),by:'Admin'}};CU={name:'Gast',role:'viewer',teams:[],loginAt:Date.now()};renderDashboard();});
 const vc=await txt(d,'#db-content .som-card');
 ok(/Finn Wolf/.test(vc)&&!(await d.$('#db-content .som-go')),'Nur-Lesen: sieht die Wahl, kein Knopf');
 ok(await d.evaluate(()=>{somOpen('2026-10');return !document.getElementById('moSom').classList.contains('open');}),'Nur-Lesen: Dialog lässt sich nicht öffnen');
 ok(!errs.length,'Trainer: keine Fehler');
 await c.close();

 // ══ players ══
 const setupP=async(p,pi,ph)=>{
   await p.evaluate(`(${setupTrainer.toString()})({})`);
   await p.evaluate(`(${october.toString()})()`);
   await p.evaluate(`(()=>{const im=(${IMG.toString()})();const P=cd().players;P[4].photo=im;P[4].fotoOk=${ph?'{v:1,t:Date.now()}':'null'};G.db['U19__som']={'2026-10':{n:'Finn Wolf',why:'Bei jedem Training da und zweimal richtig stark',t:Date.now()-2*864e5,by:'Admin'}};})()`);
   await p.evaluate(async(pi)=>{const r=_pvBuildSync('U19','2026/27');const pp=r.people.find(x=>x.pi===pi);
     const T=JSON.parse(JSON.stringify(r.shared));if(T.som&&T.som.ph)T.som.ph=await _pvThumb(T.som.ph,96);
     const P=JSON.parse(JSON.stringify(Object.assign({},pp.obj,{tk:'t'.repeat(64),lk:'abcdef0123456789abcd'})));
     window._hubMode=true;window._hubAction=null;_pvAdopt({pk:'p'.repeat(64),t:Date.now(),P,T,mvp:{},inbox:{}},pp.tok);_pmEnterSlice(pp.tok);
     fbDb={ref:()=>({set:()=>Promise.resolve(),once:()=>Promise.resolve({val:()=>null}),on:()=>{},off:()=>{}})};
     window._hubAction=null;renderPlayerMode();},pi);
   await p.waitForTimeout(300);
 };
 const c2=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 // another player, photo allowed
 let p=await c2.newPage();await p.clock.install({time:NOW});const e2=[];p.on('pageerror',e=>{e2.push(e.message);console.log('PAGEERR',e.message);});
 await p.goto('file://'+HTML);await p.waitForTimeout(700);
 await setupP(p,2,true);
 let h=await txt(p,'#playerModeWrap .som-hub');
 ok(/^Finn\b/.test(h)&&/Spieler des Monats Oktober/.test(h)&&/„Bei jedem Training da und zweimal richtig stark“/.test(h),'Übersicht (anderer Spieler): Name wie bei den Spielern (Vorname), Monat, Satz');
 ok(!/\d+ von \d+|▲/.test(h),'Übersicht: keine Zahlen');
 ok(await p.evaluate(()=>!!document.querySelector('#playerModeWrap .som-hub img.som-av')),'mit Einwilligung: sein Foto');
 ok(await p.evaluate(()=>{const s=[...document.querySelectorAll('#playerModeWrap .hub *')].map(x=>x.textContent.trim());const a=s.findIndex(t=>t==='Spieler des Monats'),l=s.findIndex(t=>t==='Letztes Spiel');return a>=0&&(l<0||a<l);}),'steht vor „Letztes Spiel“');
 ok(await p.evaluate(()=>!(G.db['U19__som']['2026-10'].by)),'die Spieler bekommen nicht, wer gewählt hat');
 if(out)await p.locator('#playerModeWrap .som-hub').screenshot({path:out+'/p_som_andere.png'});
 await p.evaluate(()=>{window._hubAction='card';renderPlayerMode();});await p.waitForTimeout(300);
 ok(!(await p.evaluate(()=>!!document.querySelector('.mk-som'))),'Karte eines anderen: keine Zeile');
 await p.close();
 // without consent: trophy, no photo
 p=await c2.newPage();await p.clock.install({time:NOW});p.on('pageerror',e=>{e2.push(e.message);console.log('PAGEERR',e.message);});
 await p.goto('file://'+HTML);await p.waitForTimeout(700);
 await setupP(p,2,false);
 ok(await p.evaluate(()=>!document.querySelector('#playerModeWrap .som-hub img')&&!!document.querySelector('#playerModeWrap .som-hub .fl-tile')),'ohne Einwilligung: Pokal statt Foto');
 await p.close();
 // the winner himself
 p=await c2.newPage();await p.clock.install({time:NOW});p.on('pageerror',e=>{e2.push(e.message);console.log('PAGEERR',e.message);});
 await p.goto('file://'+HTML);await p.waitForTimeout(700);
 await setupP(p,4,true);
 h=await txt(p,'#playerModeWrap .som-hub');
 ok(/Du bist Spieler des Monats Oktober! 🎉/.test(h)&&/„Bei jedem Training da/.test(h),'der Gewählte: „Du bist Spieler des Monats Oktober! 🎉“ mit dem Satz');
 if(out)await p.screenshot({path:out+'/p_som_selbst.png'});
 await p.evaluate(()=>{window._hubAction='card';renderPlayerMode();});await p.waitForTimeout(400);
 ok(/🏆 Spieler des Monats: Oktober 2026/.test(await txt(p,'.mk-som')),'Meine Karte: „🏆 Spieler des Monats: Oktober 2026“');
 if(out){const el=await p.$('.mk-som');if(el){await el.scrollIntoViewIfNeeded();await p.screenshot({path:out+'/p_som_karte.png'});}}
 // after two weeks: gone from the overview, stays on the card
 await p.evaluate(()=>{G.db['U19__som']['2026-10'].t=Date.now()-15*864e5;window._hubAction=null;renderPlayerMode();});await p.waitForTimeout(200);
 ok(!(await p.evaluate(()=>!!document.querySelector('#playerModeWrap .som-hub'))),'nach zwei Wochen: nicht mehr in der Übersicht');
 await p.evaluate(()=>{window._hubAction='card';renderPlayerMode();});await p.waitForTimeout(300);
 ok(/Oktober 2026/.test(await txt(p,'.mk-som')),'auf der Karte bleibt es');
 ok(!e2.length,'Spieler: keine Fehler');
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);})();
