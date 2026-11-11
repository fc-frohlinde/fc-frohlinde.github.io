// 1.2.103 Wochenthemen + Schwerpunkt 2. node tools/tests/t_wt103.js [index.html]
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');
const html=HTML;let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
const txt=(d,sel)=>d.evaluate(s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\s+/g,' ').trim():'';},sel);
(async()=>{const b=await chromium.launch();
 const c=await b.newContext({viewport:{width:1280,height:900}});const d=await c.newPage();await d.clock.install({time:NOW});
 const errs=[];d.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
 await d.goto('file://'+html);await d.waitForTimeout(800);
 await d.evaluate(`(${setupTrainer.toString()})({})`);
 await d.evaluate(()=>{window.prompt=(q,v)=>window.__pr!==undefined?window.__pr:v;});
 const map=()=>d.evaluate(()=>{const m=wtMap(cd(),'U19','2026/27');const o={};Object.keys(m).forEach(k=>o[k]=m[k].t+(m[k].set?'*':''));return o;});

 // ── nothing set: nothing shown ──
 await d.evaluate(()=>{hxRender();});
 ok(!(await d.evaluate(()=>!!document.querySelector('#hxHome .wt-pill'))),'no themes: no pill in the overview');
 ok(JSON.stringify(await map())==='{}','no themes: no week has one');

 // ── settings: add two ──
 await d.evaluate(()=>{wtRender();document.getElementById('wt-new').value='Breite';wtAdd();document.getElementById('wt-new').value=' Tiefe ';wtAdd();document.getElementById('wt-new').value='breite';wtAdd();});
 ok(await d.evaluate(()=>JSON.stringify(G.db['U19__rules'].wt))==='["Breite","Tiefe"]','settings: two themes, the same name twice refused');
 ok(await d.evaluate(()=>__dl.some(x=>/gibt es schon/.test(x))),'settings: told it exists');
 ok(await d.evaluate(()=>G.auditLog.some(a=>a.action==='Wochenthema angelegt')),'settings: journal');
 const set1=await txt(d,'#wtBox');
 ok(/1\. Breite/.test(set1)&&/2\. Tiefe/.test(set1)&&/Diese Woche: kein Thema/.test(set1),'settings: list in order, this week none yet');
 ok(JSON.stringify(await map())==='{}','no anchor yet: no theme anywhere');
 await d.evaluate(()=>hxRender());
 ok(await txt(d,'#hxHome .hx-a-week .wt-pill')==='Thema wählen','overview: "Thema wählen" for this week');

 // ── choose this week ──
 const mon=20261102;
 await d.evaluate(m=>wtOpen(m),mon);await d.waitForTimeout(150);
 ok(await d.evaluate(()=>document.getElementById('moWt').classList.contains('open')),'picker opens');
 const pk=await txt(d,'#moWt');
 ok(/KW 45/.test(pk)&&/Breite/.test(pk)&&/Tiefe/.test(pk)&&/Kein Thema/.test(pk)&&/Breite → Tiefe → Breite/.test(pk),'picker: week, both, none, the turn: '+pk.slice(0,160));
 await d.evaluate(()=>wtPick(0));
 ok(await d.evaluate(()=>cd().wk&&cd().wk.w20261102)==='Breite','chosen: stored on the week');
 let m=await map();
 ok(m[20261102]==='Breite*'&&m[20261109]==='Tiefe'&&m[20261116]==='Breite'&&!m[20261026]&&!m[20261019],'turn: 02.11 Breite, 09.11 Tiefe, 16.11 Breite, before none: '+JSON.stringify(m));
 ok(await d.evaluate(()=>G.auditLog.some(a=>a.action==='Thema der Woche'&&/KW 45/.test(a.target||'')&&/Breite/.test(a.details||a.detail||''))),'journal: Thema der Woche');
 await d.evaluate(()=>hxRender());
 ok(await txt(d,'#hxHome .hx-a-week .wt-pill')==='Breite','overview: this week Breite');

 // ── a week without trainings is skipped ──
 const sk=await d.evaluate(()=>{const D=cd();const S=D.sessions;const keep=S.slice();
   D.sessions=S.filter(s=>!(s.type==='training'&&(s.date==='Di 10.11'||s.date==='Fr 13.11')));
   const mm=wtMap(D,'U19','2026/27');D.sessions=keep;return {a:mm[20261109]&&mm[20261109].t,b:mm[20261116]&&mm[20261116].t};});
 ok(!sk.a&&sk.b==='Tiefe','no trainings 09.11: skipped, 16.11 Tiefe ('+JSON.stringify(sk)+')');
 // ── "no theme" for one week: the turn goes on from the last ──
 await d.evaluate(()=>{wtOpen(20261109);wtPick(-1);});
 m=await map();
 ok(m[20261109]==='*'&&m[20261116]==='Tiefe'&&m[20261102]==='Breite*','kein Thema 09.11: 16.11 Tiefe: '+JSON.stringify(m));
 await d.evaluate(()=>wtOpen(20261109));
 ok(/Wieder der Reihe nach/.test(await txt(d,'#moWt')),'picker: back to the turn offered');
 await d.evaluate(()=>wtPick(-2));
 m=await map();
 ok(m[20261109]==='Tiefe'&&m[20261116]==='Breite'&&!(await d.evaluate(()=>'w20261109' in (cd().wk||{}))),'back to the turn: override gone');
 // picking what it has anyway stores nothing
 const n0=await d.evaluate(()=>G.auditLog.length);
 await d.evaluate(()=>{wtOpen(20261109);wtPick(1);});
 ok(await d.evaluate(()=>!('w20261109' in (cd().wk||{}))),'picking the automatic one: nothing stored');

 // ── the match of the week ──
 const si8=await d.evaluate(()=>cd().sessions.findIndex(s=>s.date==='So 08.11'));
 ok(await d.evaluate(si=>evtOf(cd().sessions[si]),si8)==='Breite','match 08.11: Bewertungsthema Breite from its week');
 await d.evaluate(si=>openSessStats(si),si8);await d.waitForTimeout(200);
 const evr=await txt(d,'#ss-evaltopic');
 ok(/Breite/.test(evr)&&/Thema der Woche/.test(evr),'match window: shows Breite (Thema der Woche): '+evr);
 await d.evaluate(()=>toggleSessEdit());
 const opt=await d.evaluate(()=>{const s=document.getElementById('ss-e-evt');return s?[...s.options].map(o=>(o.selected?'*':'')+o.value+'='+o.text).join('|'):'';});
 ok(/^\*__wk=Thema der Woche \(Breite\)/.test(opt)&&/Tiefe/.test(opt),'match form: week theme selected by default: '+opt);
 await d.evaluate(si=>setEvalTopic(si,''),si8);
 ok(await d.evaluate(si=>{const s=cd().sessions[si];return s.evtOff===1&&!s.evalTopic&&evtOf(s)==='';},si8),'match: "Kein" switches the week theme off');
 await d.evaluate(si=>setEvalTopic(si,'__wk'),si8);
 ok(await d.evaluate(si=>{const s=cd().sessions[si];return !s.evtOff&&!s.evalTopic&&evtOf(s)==='Breite';},si8),'match: back to the week theme');
 await d.evaluate(si=>setEvalTopic(si,'Umschalten'),si8);
 ok(await d.evaluate(si=>evtOf(cd().sessions[si])==='Umschalten'&&evalTopics(cd()).includes('Umschalten'),si8),'match: own topic wins');
 await d.evaluate(si=>setEvalTopic(si,'__wk'),si8);
 await d.evaluate(()=>closeM('moSession2'));

 // ── statistics by topic: past matches in themed weeks ──
 await d.evaluate(()=>{wtOpen(20261019);wtPick(0);});   // 19.10 Breite → 26.10 Tiefe → 02.11 Breite (set)
 m=await map();
 ok(m[20261019]==='Breite*'&&m[20261026]==='Tiefe'&&m[20261102]==='Breite*','second anchor 19.10: '+JSON.stringify(m));
 const st=await d.evaluate(()=>{const D=cd();const a=D.sessions.findIndex(s=>s.date==='So 25.10'),b2=D.sessions.findIndex(s=>s.date==='So 01.11');
   D.players.forEach((p,i)=>{p.perf=p.perf||[];p.perf[a]=1+(i%2);p.perf[b2]=2+(i%2);});
   const card=dbRenderTopicCard({team:'U19',season:'2026/27',block:D,sessions:D.sessions,players:D.players});
   const ser=computeTopicSeries(findPlayerOccurrences(D.players[0].name,D.players[0].birthdate||''));
   return {card,keys:Object.keys(ser).sort().join(',')};});
 ok(/Breite/.test(st.card)&&/Tiefe/.test(st.card),'Spiel-Themen card groups by Breite and Tiefe');
 ok(st.keys==='Breite,Tiefe','player series by Breite and Tiefe: '+st.keys);

 // ── a training: theme of the week and both Schwerpunkte ──
 const si3=await d.evaluate(()=>{const D=cd();const i=D.sessions.findIndex(s=>s.date==='Di 03.11');D.sessions[i].focus2='Umschalten';
   const j=D.sessions.findIndex(s=>s.date==='Di 10.11');D.sessions[j].focus2='Standards';return i;});
 await d.evaluate(si=>openSessStats(si),si3);await d.waitForTimeout(200);
 const meta=await txt(d,'#ss-meta');
 ok(/Woche: Breite/.test(meta)&&/Pressing \+ Umschalten/.test(meta),'training window: '+meta);
 await d.evaluate(()=>toggleSessEdit());
 const wo=await d.evaluate(()=>{const s=document.getElementById('ss-e-wt');return s?[...s.options].map(o=>(o.selected?'*':'')+o.value).join('|'):'';});
 ok(wo==='__auto|*Breite|Tiefe|-','training form: theme of the week, set one selected: '+wo);
 await d.evaluate(si=>wtSetForSess(si,'Tiefe'),si3);await d.waitForTimeout(100);
 ok(/Woche: Tiefe/.test(await txt(d,'#ss-meta')),'training form: change shows at once');
 m=await map();
 ok(m[20261102]==='Tiefe*'&&m[20261109]==='Breite','changed week: the next follow it: '+JSON.stringify(m));
 await d.evaluate(si=>updSessFoc2(si,'Standards'),si3);
 ok(/Pressing \+ Standards/.test(await txt(d,'#ss-meta')),'Schwerpunkt 2 changed: the line follows at once');
 await d.evaluate(si=>{wtSetForSess(si,'Breite');updSessFoc2(si,'Umschalten');},si3);
 await d.evaluate(()=>closeM('moSession2'));

 // ── overview: Schwerpunkt 2 on the cards ──
 await d.evaluate(()=>hxRender());
 const wl=await d.evaluate(()=>[...document.querySelectorAll('#hxHome .hx-a-week .hx-day')].map(e=>e.innerText.replace(/\s+/g,' ')).join(' | '));
 ok(/Pressing\s*\+ Umschalten/.test(wl),'overview week: second Schwerpunkt shown: '+wl);
 // hero card: make Di 10.11 the next one
 const hero=await d.evaluate(()=>{const e=document.querySelector('#hxHome .hx-a-hero .hx-focus-title');return e?e.innerText:'';});
 const nxt=await d.evaluate(()=>{const e=document.querySelector('#hxHome .hx-a-match .hx-match-t');return e?e.innerText:'';});
 ok(/Standards/.test(hero+' '+nxt),'overview next training shows the second: '+hero+' / '+nxt);

 // ── week report (trainers) ──
 const wr=await d.evaluate(()=>{const D=cd();return dbRenderWeekReportSection({team:'U19',season:'2026/27',block:D,sessions:D.sessions,players:D.players});});
 ok(/Thema der Woche: <b>Breite<\/b>/.test(wr),'week report: Thema der Woche');

 // ── calendar ──
 await d.evaluate(()=>{_calCur={y:2026,m:11};hxGo('cal');});await d.waitForTimeout(250);
 const cx=await d.evaluate(()=>[...document.querySelectorAll('.calx-kw')].map(e=>e.innerText.replace(/\s+/g,' ')).join(' | '));
 ok(/45 ?Breite/.test(cx)&&/46 ?Tiefe/.test(cx)&&/47 ?Breite/.test(cx),'calendar month: themes under KW: '+cx);
 const ct=await d.evaluate(()=>[...document.querySelectorAll('.calx-day .calx-e,.calx-day')].map(e=>e.innerText.replace(/\s+/g,' ')).join(' ').match(/Pressing \+ Umschalten/)?1:0);
 ok(ct===1,'calendar month: training shows both Schwerpunkte');

 // ── planner head ──
 await d.evaluate(si=>tplOpen(si),si3);await d.waitForTimeout(400);
 const th=await txt(d,'#tplSub');
 ok(/Woche: Breite/.test(th)&&/Schwerpunkt: Pressing \+ Umschalten/.test(th),'planner head: '+th);
 await d.evaluate(()=>{try{tplClose();}catch(e){const o=document.getElementById('tplOverlay');if(o)o.classList.remove('open');}});

 // ── nothing for the players ──
 const sl=await d.evaluate(()=>{const r=_pvBuildSync('U19','2026/27');return JSON.stringify(r);});
 ok(!/Breite|Tiefe/.test(sl)&&!/"wk"/.test(sl)&&!/"wt"/.test(sl),'player slices: no themes, no week list');

 // ── settings: rename, order, delete ──
 await d.evaluate(()=>{window.__pr='Breite (Flügel)';wtRen(0);window.__pr=undefined;});
 ok(await d.evaluate(()=>JSON.stringify(G.db['U19__rules'].wt)==='["Breite (Flügel)","Tiefe"]'&&cd().wk.w20261102==='Breite (Flügel)'&&cd().wk.w20261019==='Breite (Flügel)'),'rename: list and set weeks');
 await d.evaluate(()=>wtMove(1));
 ok(await d.evaluate(()=>JSON.stringify(G.db['U19__rules'].wt))==='["Tiefe","Breite (Flügel)"]','order: Tiefe first');
 await d.evaluate(()=>{document.getElementById('wt-new').value='Zentrum';wtAdd();});
 m=await map();
 // Liste jetzt Tiefe, Breite (F), Zentrum: nach Breite (F) kommt Zentrum, danach Tiefe
 ok(m[20261026]==='Zentrum'&&m[20261109]==='Zentrum'&&m[20261116]==='Tiefe','three themes: the turn takes the list order: '+JSON.stringify(m));
 await d.evaluate(()=>wtDel(2));
 ok(await d.evaluate(()=>JSON.stringify(G.db['U19__rules'].wt))==='["Tiefe","Breite (Flügel)"]','delete: gone');
 await d.evaluate(()=>{wtDel(1);wtDel(0);});
 ok(await d.evaluate(()=>!G.db['U19__rules'].wt&&!cd().wk),'delete all: list and set weeks gone');
 ok(JSON.stringify(await map())==='{}','delete all: nothing shown');

 // ── Schwerpunkte in the settings count the second ──
 await d.evaluate(()=>{const f=teamFoc();if(!f.includes('Umschalten'))f.push('Umschalten');renderFocList();});
 const fl=await txt(d,'#foc-list');
 ok(/\+ 1\/1 als 2\./.test(fl),'Schwerpunkte: "+ 1/1 als 2." for Umschalten: '+fl.slice(0,200));

 // ── a trainer without "Mannschaft verwalten": may pick the week, not change the list ──
 await d.evaluate(()=>{G.db['U19__rules'].wt=['Breite','Tiefe'];CU={role:'trainer',name:'Ole Muster',teams:['U19']};});
 await d.evaluate(()=>{wtRender();const i=document.getElementById('wt-new');if(i){i.value='X';wtAdd();}});
 ok(await d.evaluate(()=>JSON.stringify(G.db['U19__rules'].wt))==='["Breite","Tiefe"]','trainer without the right: cannot add to the list');
 await d.evaluate(()=>{wtOpen(20261102);wtPick(1);});
 ok(await d.evaluate(()=>cd().wk&&cd().wk.w20261102)==='Tiefe','trainer without the right: can choose the week');
 ok(!errs.length,'no page errors');
 await c.close();

 // ── phone: overview header and calendar list ──
 const c2=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await c2.newPage();await p.clock.install({time:NOW});
 p.on('pageerror',e=>{console.log('PAGEERR',e.message);fails++;});
 await p.goto('file://'+html);await p.waitForTimeout(800);
 await p.evaluate(`(${setupTrainer.toString()})({})`);
 await p.evaluate(()=>{G.db['U19__rules'].wt=['Breite','Tiefe'];cd().wk={w20261102:'Breite'};hxRender();});
 ok(await txt(p,'#hxHome .hx-a-week .wt-pill')==='Breite','phone overview: Breite');
 const ov=await p.evaluate(()=>{const r=document.querySelector('#hxHome .hx-a-week .hx-h2row');return r?r.scrollWidth<=r.clientWidth+1:false;});
 ok(ov,'phone overview: header fits');
 await p.evaluate(()=>{hxGo('cal');});await p.waitForTimeout(250);
 const cm=await p.evaluate(()=>[...document.querySelectorAll('.calm-wh')].map(e=>e.innerText.replace(/\s+/g,' ')).join(' | '));
 ok(/KW 45 .*Breite/.test(cm)&&/KW 46 .*Tiefe/.test(cm),'phone calendar: themes on the week heads: '+cm.slice(0,200));
 await c2.close();
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
})();
