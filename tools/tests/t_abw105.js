// 1.2.105 Abwesenheit melden. node tools/tests/t_abw105.js [index.html] [shotdir]
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');
const html=HTML,out=process.argv[3]||'';let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
const txt=(d,sel)=>d.evaluate(s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\s+/g,' ').trim():'';},sel);
(async()=>{const b=await chromium.launch();
 // ══ player (phone) ══
 const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await c.newPage();await p.clock.install({time:NOW});
 const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
 await p.goto('file://'+html);await p.waitForTimeout(800);
 await p.evaluate(`(${setupTrainer.toString()})({})`);
 await p.evaluate(()=>{G.db['U19__rules'].abs={m:'anruf'};G.trainers=[{name:'Kai Test',phone:'0170 1234567',teams:['U19']}];
   const r=_pvBuildSync('U19','2026/27');const pp=r.people.find(x=>x.pi===2);
   const P=JSON.parse(JSON.stringify(Object.assign({},pp.obj,{tk:'t'.repeat(64),lk:'abcdef0123456789abcd'})));
   window._hubMode=true;window._hubAction='week';_pvAdopt({pk:'p'.repeat(64),t:Date.now(),P,T:JSON.parse(JSON.stringify(r.shared)),mvp:{},inbox:{}},pp.tok);_pmEnterSlice(pp.tok);
   window.__w=[];fbDb={ref:path=>({set:v=>{window.__w.push([path,JSON.parse(JSON.stringify(v))]);return Promise.resolve();},once:()=>Promise.resolve({val:()=>null}),on:()=>{},off:()=>{}})};
   window._hubAction='week';renderPlayerMode();});
 await p.waitForTimeout(300);
 ok(/Abwesenheit melden/.test(await txt(p,'.abw-new')),'week: "Länger nicht da? Abwesenheit melden"');
 await p.evaluate(()=>abwOpen());await p.waitForTimeout(200);
 ok(/Länger nicht da/.test(await txt(p,'.pm-wrap.abw .fl-title')),'own screen opens');
 await p.evaluate(()=>{document.getElementById('abw-f').value='2026-11-09';document.getElementById('abw-u').value='2026-11-15';abwUpd();abwG('u');});
 const pv=await txt(p,'#abw-prev');
 ok(/Betrifft 3 Termine/.test(pv)&&/Di 10\.11\./.test(pv)&&/Fr 13\.11\./.test(pv)&&/So 15\.11\./.test(pv),'preview: the 3 sessions: '+pv.slice(0,160));
 ok(/erst nach einem Anruf/.test(pv)&&/Kai anrufen/.test(pv),'preview: the call rule and a call button');
 ok(await txt(p,'#abw-go')==='Für 3 Termine absagen','button says how many');
 ok(await p.evaluate(()=>document.querySelector('.abw-chip.on').dataset.g)==='u','reason chosen: Urlaub');
 if(out)await p.screenshot({path:out+'/p_abw_neu.png',fullPage:true});
 // the end before the start: corrected
 await p.evaluate(()=>{document.getElementById('abw-u').value='2026-11-08';abwUpd();});
 ok(await p.evaluate(()=>document.getElementById('abw-u').value)==='2026-11-09','end before start: set to the start');
 await p.evaluate(()=>{document.getElementById('abw-u').value='2026-11-15';abwUpd();abwSend();});await p.waitForTimeout(200);
 const w1=await p.evaluate(()=>window.__w);
 ok(w1.length===1&&/\/b_20261109$/.test(w1[0][0])&&w1[0][1].a==='abs'&&w1[0][1].f===20261109&&w1[0][1].u===20261115&&w1[0][1].g==='u'&&w1[0][1].v===1,'sent: one entry b_20261109 '+JSON.stringify(w1[0]&&w1[0][1]));
 const st1=await p.evaluate(()=>{const D=cd(),q=D.players[CU.playerIdx];return ['Di 10.11','Fr 13.11','So 15.11','Fr 06.11'].map(d=>q.s[D.sessions.findIndex(s=>s.date===d)]);});
 ok(st1[0]===0&&st1[1]===0&&st1[2]===0,'shown at once: the three are "Kann nicht" ('+st1+')');
 const wk=await txt(p,'.abw-sec');
 ok(/Abgemeldet Mo 9\.11\. – So 15\.11\./.test(wk)&&/Urlaub/.test(wk)&&/Ändern oder zurückziehen/.test(wk),'week: the absence card: '+wk.slice(0,120));
 if(out){const el=await p.$('.abw-sec');if(el){await el.scrollIntoViewIfNeeded();await p.screenshot({path:out+'/p_abw_woche.png'});}}
 // back earlier: from Fr 13.11
 await p.evaluate(()=>abwBackOpen('b20261109'));await p.waitForTimeout(150);
 await p.evaluate(()=>{document.getElementById('abw-b').value='2026-11-13';abwUpd();});
 ok(await txt(p,'#abw-go')==='Ab Fr 13.11. wieder dabei'&&/Wieder eingeplant für 2 Termine/.test(await txt(p,'#abw-prev')),'back earlier: says from when and what');
 if(out)await p.screenshot({path:out+'/p_abw_zurueck.png',fullPage:true});
 await p.evaluate(()=>abwSend());await p.waitForTimeout(150);
 const w2=await p.evaluate(()=>window.__w[window.__w.length-1][1]);
 ok(w2.f===20261109&&w2.u===20261112&&w2.v===1&&w2.g==='u','sent: same key, until Thu 12.11.');
 const st2=await p.evaluate(()=>{const D=cd(),q=D.players[CU.playerIdx];return ['Di 10.11','Fr 13.11','So 15.11'].map(d=>q.s[D.sessions.findIndex(s=>s.date===d)]);});
 ok(st2[0]===0&&st2[1]===4&&st2[2]===4,'Fr and So: Komme again ('+st2+')');
 // withdraw (not started yet)
 await p.evaluate(()=>{abwBackOpen('b20261109');});
 ok(/Abwesenheit zurückziehen/.test(await txt(p,'.abw-undo')),'not started: can be withdrawn');
 await p.evaluate(()=>abwWithdraw());await p.waitForTimeout(150);
 const w3=await p.evaluate(()=>window.__w[window.__w.length-1][1]);
 const st3=await p.evaluate(()=>{const D=cd(),q=D.players[CU.playerIdx];return q.s[D.sessions.findIndex(s=>s.date==='Di 10.11')];});
 ok(w3.v===0&&st3===4&&!(await p.evaluate(()=>!!document.querySelector('.abw-card'))),'withdrawn: entry v 0, Komme again, no card');
 // a session whose answers are closed: only by phone
 await p.evaluate(()=>{const D=cd();const i=D.sessions.findIndex(s=>s.date==='Di 10.11');D.sessions[i].rsvpUntil=Date.now()-60e3;abwOpen();
   document.getElementById('abw-f').value='2026-11-09';document.getElementById('abw-u').value='2026-11-11';abwUpd();});
 const pv2=await txt(p,'#abw-prev');
 ok(/Antwortzeit vorbei – nur per Anruf/.test(pv2)&&await p.evaluate(()=>document.getElementById('abw-go').disabled),'closed answers: listed, nothing to send');
 ok(!errs.length,'player: no page errors');
 await c.close();

 // ══ trainers (computer) ══
 const c2=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});const d=await c2.newPage();await d.clock.install({time:NOW});
 const e2=[];d.on('pageerror',e=>{e2.push(e.message);console.log('PAGEERR',e.message);});
 await d.goto('file://'+html);await d.waitForTimeout(800);
 await d.evaluate(`(${setupTrainer.toString()})({})`);
 const r0=await d.evaluate(()=>{G.db['U19__rules'].abs={m:'anruf'};const D=cd();
   const e={a:'abs',f:20261109,u:20261115,g:'k',v:1,t:Date.now(),st:Date.now()};
   const r=pvApply(D,3,e,teamRules('U19'));
   const e2={a:'abs',f:20261109,u:20261122,g:'u',v:1,t:Date.now(),st:Date.now()};
   pvApply(D,4,e2,teamRules('U19'));
   const q=D.players[3];return {ok:r.ok,abw:r.abw,s:['Di 10.11','Fr 13.11','So 15.11'].map(x=>q.s[D.sessions.findIndex(s=>s.date===x)]),aud:r.audit};});
 ok(r0.ok&&r0.abw.n===3&&r0.s.every(v=>v===0),'merged: 3 sessions F under "Immer per Anruf"');
 ok(r0.aud&&r0.aud.action==='Abwesenheit (Spieler-App)'&&!/krank|Krank/.test(JSON.stringify(r0.aud)),'journal entry without the reason');
 await d.evaluate(()=>{const h=document.getElementById('homeOverlay');if(h)h.style.display='';hxGo('home');hxRender();});await d.waitForTimeout(300);
 const flags=await d.evaluate(()=>[...document.querySelectorAll('#hxHome .hx-flag, #hxHome [class*="flag"] li, #hxHome .hx-fl')].map(e=>e.innerText.replace(/\s+/g,' ')).join(' | ')+' || '+document.getElementById('hxHome').innerText.replace(/\s+/g,' '));
 ok(/nicht da Mo 9\.11\. – So 15\.11\. · Krank oder verletzt · 3 Termine – bestätigen\?/.test(flags),'Im Blick: the absence to confirm');
 if(out){const el=await d.$('#hxHome .hx-a-flags, #hxHome section[aria-label*="Blick"]');if(el)await el.screenshot({path:out+'/d_abw_imblick.png'});}
 await d.evaluate(()=>abwConfirmOpen(3,'b20261109'));await d.waitForTimeout(200);
 const dlg=await txt(d,'#moAbw');
 ok(/Abwesenheit · /.test(dlg)&&/Mo 9\.11\. – So 15\.11\. · 7 Tage · Krank oder verletzt/.test(dlg)&&/Entschuldigen/.test(dlg)&&!/Als Pause/.test(dlg),'dialog: span, days, reason, no Pause under 14 days');
 if(out){const el=await d.$('#moAbw .mob');if(el)await el.screenshot({path:out+'/d_abw_dialog.png'});}
 await d.evaluate(()=>abwConfirm('E'));await d.waitForTimeout(150);
 const r1=await d.evaluate(()=>{const D=cd(),q=D.players[3];return {s:['Di 10.11','Fr 13.11','So 15.11'].map(x=>q.s[D.sessions.findIndex(s=>s.date===x)]),ex:['Di 10.11','Fr 13.11'].map(x=>q.excOK[D.sessions.findIndex(s=>s.date===x)]),ok:q.abw.b20261109.ok,aud:G.auditLog.some(a=>a.action==='Abwesenheit entschuldigt')};});
 ok(r1.s.every(v=>v===2)&&r1.ex.every(v=>v===true)&&r1.ok.how==='E'&&r1.aud,'Entschuldigen: all E, by the trainers, journal');
 await d.evaluate(()=>hxRender());
 ok(!/Krank oder verletzt · 3 Termine/.test(await txt(d,'#hxHome')),'confirmed: gone from Im Blick');
 // two weeks: as a pause
 await d.evaluate(()=>abwConfirmOpen(4,'b20261109'));
 ok(/Als Pause eintragen/.test(await txt(d,'#moAbw')),'14 days: Pause offered');
 await d.evaluate(()=>abwConfirm('P'));await d.waitForTimeout(150);
 ok(await d.evaluate(()=>{const q=cd().players[4];return Array.isArray(q.pauses)&&q.pauses.some(z=>z.f==='2026-11-09'&&z.t==='2026-11-22')&&q.abw.b20261109.ok.how==='P';}),'as Pause: pause 09.–22.11. set');
 // a session added inside a confirmed absence: excused by itself
 const r2=await d.evaluate(()=>{const D=cd();D.sessions.push({date:'Mi 11.11',time:'18:30',type:'training',duration:90});
   D.players.forEach(q=>{if(q&&Array.isArray(q.s))q.s[D.sessions.length-1]=3;});render();const i=D.sessions.length-1;return {s:D.players[3].s[i],ex:D.players[3].excOK[i],o:D.players[1].s[i]};});
 // die anderen: nur die Antwort-Regel der Mannschaft („M“), keine Entschuldigung
 ok(r2.s===2&&r2.ex===true&&r2.o===4,'new session inside it: E for him, others only the answer rule (M) '+JSON.stringify(r2));
 // the reason goes 4 weeks after the end
 await d.evaluate(()=>{cd().players[5].abw={b20261001:{f:20261001,u:20261005,g:'k',t:1,st:1}};render();});
 ok(await d.evaluate(()=>!cd().players[5].abw.b20261001.g&&cd().players[5].abw.b20261001.u===20261005),'reason gone 4 weeks after the end, the absence stays');
 // profile
 await d.evaluate(()=>openPlayerStats(3));await d.waitForTimeout(300);
 ok(/Abgemeldet Mo 9\.11\. – So 15\.11\. · Krank oder verletzt/.test(await txt(d,'#ps-status'))&&/entschuldigt/.test(await txt(d,'#ps-status')),'profile: the absence');
 await d.evaluate(()=>closeM('moPlayer'));
 // slices: his own record has it, the team part not
 const sl=await d.evaluate(()=>{const r=_pvBuildSync('U19','2026/27');const me=r.people.find(x=>x.pi===3),other=r.people.find(x=>x.pi===2);
   return {me:JSON.stringify(me.obj),other:JSON.stringify(other.obj),shared:JSON.stringify(r.shared)};});
 ok(/"abw"/.test(sl.me)&&!/"abw"/.test(sl.other)&&!/"abw"/.test(sl.shared),'slices: only his own record has it');
 // privacy and notification kinds
 ok(await d.evaluate(()=>/krank oder verletzt“ wählen/.test(_privHtml())&&PRIV_STAND==='11.11.2026'),'Datenschutzhinweise: the reason explained');
 ok(await d.evaluate(()=>TPUSH_KINDS.some(k=>k[0]==='abw'&&k[4]===true)),'trainers notification kind "Abwesenheiten", on by default');
 ok(!e2.length,'trainers: no page errors');
 await c2.close();
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
})();
