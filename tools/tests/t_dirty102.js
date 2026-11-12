// Ungespeichertes geht nie verloren (1.2.102): hat eine Person G geändert und
// das Speichern ist noch nicht gelaufen (es wartet z. B. auf ein await), darf
// ein ankommender Server-Stand die Änderung nicht ersetzen — sie geht zuerst raus.
// node tools/tests/t_dirty102.js [index.html]
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
 await p.evaluate(()=>{const D=cd();window.__si=D.sessions.findIndex(s=>s.date==='Fr 06.11');window.__m=D.sessions.findIndex(s=>s.date==='So 08.11');startSync({server:G,local:G});});
 await wait(400);
 const read=src=>p.evaluate(src=>{const d=src==='srv'?fbDecode(__FB.get('fcf_data')):G;const B=d.db['U19__2026/27'];
   return {s10:B.players[10].s[__si],g3:(B.players[3].goals||[])[__m]||null};},src);
 // 1. eine Person ändert G, das Speichern läuft noch nicht
 await p.keyboard.press('Shift');
 await p.evaluate(()=>{G.db['U19__2026/27'].players[10].s[__si]=0;});
 // 2. ein anderer Trainer schreibt etwas anderes — der Stand kommt an
 await p.evaluate(()=>{const a=[];a[__m]=1;__FB.remote('fcf_data/db/U19__2026__SL__27/players/v/3/goals',{__arr:1,v:a});});
 await wait(1500);
 let s=await read('srv'),l=await read('loc');
 ok(s.s10===0,'die ungespeicherte Änderung ging zuerst auf den Server');
 ok(l.s10===0,'und ist auf dem Gerät nicht ersetzt worden');
 ok(s.g3===1&&l.g3===1,'die fremde Änderung ist trotzdem überall da');
 // 3. ohne Eingabe (nur Stände vom Server): kein Vergleich, kein Schreiben
 const n0=await p.evaluate(()=>__FB.dataWrites().length);
 await p.evaluate(()=>{const a=[];a[__m]=2;__FB.remote('fcf_data/db/U19__2026__SL__27/players/v/4/goals',{__arr:1,v:a});});
 await wait(1200);
 ok(await p.evaluate(n0=>__FB.dataWrites().length===n0,n0),'Stand ohne eigene Eingabe: nichts gesendet');
 ok(await p.evaluate(()=>(G.db['U19__2026/27'].players[4].goals||[])[__m]===2),'und übernommen');
 ok(!errs.length,'keine Fehler');
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);})();
