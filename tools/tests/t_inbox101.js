// Antworten der Spieler aus dem Eingang (1.2.101): jede übernommene Antwort
// wird sofort gespeichert. 08.11.2026 gingen 9 von 10 Bewertungen verloren:
// der Journal-Eintrag unter fcf_data löste den Listener aus, und der übernahm
// den Server-Stand ohne die Antwort, bevor gespeichert war.
// node tools/tests/t_inbox101.js [index.html]
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');const {installFake,startSync}=require('./fakefb.js');
let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await chromium.launch();
 const c=await b.newContext({viewport:{width:1280,height:800}});const p=await c.newPage();await p.clock.install({time:NOW});
 const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
 await p.goto('file://'+HTML);await p.waitForTimeout(600);
 await p.evaluate(`(${setupTrainer.toString()})({})`);
 await p.evaluate(`(${installFake.toString()})()`);
 await p.evaluate(`window.startSync=${startSync.toString()}`);
 await p.clock.resume();
 await p.evaluate(()=>{const D=cd();window.__si=D.sessions.findIndex(s=>s.date==='Fr 06.11');startSync({server:G,local:G});});
 await wait(400);
 // drei Bewertungen von drei Spielern im Eingang (Fr 06.11, 18:30)
 await p.evaluate(()=>{
   const k='k1106-1830t',now=Date.now(),box={};
   [[3,7],[4,5],[6,8]].forEach(([pi,v],j)=>{box['PK'+pi]={['r_'+k]:{a:'rpe',v,k,si:__si,t:now-60000+j}};});
   window.__FB.tree.fcf_in=box;
   _pvInbox=JSON.parse(JSON.stringify(box));
   _pvKeyMap=async()=>({PK3:{team:'U19',key:'U19__2026/27',pi:3,season:'2026/27'},PK4:{team:'U19',key:'U19__2026/27',pi:4,season:'2026/27'},PK6:{team:'U19',key:'U19__2026/27',pi:6,season:'2026/27'}});
   _pvCanWrite=()=>true;
 });
 await p.evaluate(()=>pvMergeInbox());
 await wait(1800);
 const r=await p.evaluate(()=>{const S=fbDecode(__FB.get('fcf_data')).db['U19__2026/27'],L=G.db['U19__2026/27'];
   const v=(B,pi)=>(B.players[pi].rpe||[])[__si];
   return {srv:[v(S,3),v(S,4),v(S,6)],loc:[v(L,3),v(L,4),v(L,6)],m:Object.values(__FB.get('fcf_in')||{}).map(b=>Object.values(b)[0].m?1:0),
     journal:Object.values((__FB.get('fcf_data')||{}).auditLogP||{}).filter(e=>e&&e.action==='Belastung bewertet').length};});
 ok(JSON.stringify(r.srv)==='[7,5,8]','alle drei Bewertungen sind auf dem Server: '+JSON.stringify(r.srv));
 ok(JSON.stringify(r.loc)==='[7,5,8]','und auf dem Gerät: '+JSON.stringify(r.loc));
 ok(r.m.join()==='1,1,1','Eingang: alle drei als übernommen markiert');
 ok(r.journal===3,'Journal: 3 Einträge „Belastung bewertet“');
 ok(!errs.length,'keine Fehler');
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);})();
