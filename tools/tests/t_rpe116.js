// 1.2.116: Belastung – Trainer erinnern die Gruppe. node tools/tests/t_rpe116.js [index.html] [shotdir]
// „Noch offen“ ohne N, echte Frist auf der Karte, Gruppen-Erinnerung wird am Termin
// vermerkt (für den anderen Trainer und den Job), Push-Link ?go=rpe öffnet die
// Übersicht, Einstellung „Belastung nachfragen“, nichts davon bei den Spielern.
const {chromium}=require('playwright');const {setupTrainer,HTML}=require('./fx.js');
const out=process.argv[3]||'';let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
(async()=>{const b=await chromium.launch();
 const c=await b.newContext({viewport:{width:1280,height:860}});const p=await c.newPage();
 await p.clock.install({time:new Date('2026-11-06T21:30:00+01:00')});const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
 await p.goto('file://'+HTML);await p.waitForTimeout(600);await p.evaluate(`(${setupTrainer.toString()})({})`);
 const si=await p.evaluate(()=>{const D=cd(),si=D.sessions.findIndex(s=>s.date==='Fr 06.11'&&s.type==='training');
   D.players.forEach(p=>{p.s[si]=1;if(Array.isArray(p.rpe))p.rpe[si]=null;});D.players[13].s[si]=0;D.players[14].s[si]=5;
   G.adminAuth=Object.assign({},G.adminAuth||{},{firstName:'Kai'});window.__wa=[];window.open=u=>{window.__wa.push(String(u));return null;};return si;});
 const g=await p.evaluate(si=>{const D=cd();const r=_rpeSessGroups(D,D.sessions[si],si,'2026/27');return {open:r.open.length,names:r.open.map(x=>x.n)};},si);
 ok(g.open===13,'„Noch offen“: 13 (ohne F und ohne N) – war '+g.open);
 await p.evaluate(si=>openSessStats(si),si);await p.waitForTimeout(400);
 const card=await p.evaluate(()=>{const e=document.querySelector('#ss-rpe-wrap .rpe-card-txt');return e?e.innerText.replace(/\s+/g,' '):'';});
 ok(/0 von 13 bewertet · bis morgen 24 Uhr/.test(card),'Karte: „0 von 13 bewertet · bis morgen 24 Uhr“ ('+card+')');
 await p.evaluate(si=>{closeM('moSession2');rpeAllOpen(si);},si);await p.waitForTimeout(300);
 let ov=await p.evaluate(()=>document.getElementById('rpe-all-body').innerText.replace(/\s+/g,' '));
 ok(/Erinnerung in die WhatsApp-Gruppe/.test(ov)&&!/In der Gruppe erinnert/.test(ov),'Übersicht: Knopf, noch kein Vermerk');
 await p.click('#rpe-all-body .rpe-remind');await p.waitForTimeout(300);
 const wa=await p.evaluate(()=>window.__wa);
 ok(wa.length===1&&/^https:\/\/wa\.me\/\?text=/.test(wa[0])&&/bis%20morgen%2024%20Uhr%20eintragen/.test(wa[0]),'WhatsApp mit fertigem Text („bis morgen 24 Uhr“)');
 const grp=await p.evaluate(si=>cd().sessions[si].rpeGrp,si);
 ok(grp&&grp.by==='Admin'&&Math.abs(grp.t-new Date('2026-11-06T21:30:00+01:00').getTime())<6e4,'am Termin vermerkt: {t, by}');
 ov=await p.evaluate(()=>document.getElementById('rpe-all-body').innerText.replace(/\s+/g,' '));
 ok(/In der Gruppe erinnert: Kai · heute 21:30 Uhr/.test(ov),'Vermerk sichtbar: „In der Gruppe erinnert: Kai · heute 21:30 Uhr“');
 if(out)await p.locator('#moRpeAll .mob').screenshot({path:out+'/t_rpe116_uebersicht.png'});
 ok(await p.evaluate(si=>{const r=_pvBuildSync('U19','2026/27');return !JSON.stringify(r.shared.sessions[si]).includes('rpeGrp')&&!JSON.stringify(r.shared).includes('rpeGrp');},si),'Spieler bekommen den Vermerk nicht');
 // push link
 await p.evaluate(()=>{closeM('moRpeAll');});await p.waitForTimeout(200);
 await p.evaluate(si=>{_tgo={go:'rpe',i:String(si),t:'U19',s:'2026/27'};_tgoRun();},si);await p.waitForTimeout(700);
 ok(await p.evaluate(()=>document.getElementById('moRpeAll').classList.contains('open')),'Push-Link ?go=rpe öffnet die Übersicht');
 // setting
 ok(await p.evaluate(()=>TPUSH_KINDS.some(k=>k[0]==='rpeask'&&k[2]==='Belastung nachfragen'&&k[4]===true)),'Einstellung „Belastung nachfragen“, an');
 // read-only: no button, no note
 await p.evaluate(si=>{closeM('moRpeAll');delete cd().sessions[si].rpeGrp;CU={name:'Gast',role:'viewer',teams:[],loginAt:Date.now()};window.__wa=[];rpeRemindGroup(si);},si);
 ok(await p.evaluate(si=>!cd().sessions[si].rpeGrp&&!window.__wa.length,si),'Nur-Lesen: kein Vermerk, kein WhatsApp');
 ok(!errs.length,'keine Fehler');
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);})();
