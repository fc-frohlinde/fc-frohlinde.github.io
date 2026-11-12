// Synchronisation (1.2.96, Vorfall 08.11.2026): ein Gerät schickt nur, was es
// selbst geändert hat — eine alte Kopie überschreibt nie den Server.
// Szenarien A–F mit einem Firebase im Speicher (fakefb.js).
// node tools/tests/t_sync96.js [index.html]
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');const {installFake,startSync}=require('./fakefb.js');
let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(b){
  const c=await b.newContext({viewport:{width:1280,height:800}});const p=await c.newPage();await p.clock.install({time:NOW});
  const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
  await p.goto('file://'+HTML);await p.waitForTimeout(600);
  await p.evaluate(`(${setupTrainer.toString()})({})`);
  await p.evaluate(`(${installFake.toString()})()`);
  await p.evaluate(`window.startSync=${startSync.toString()}`);
  // the real clock from here on: debounce and write timers must run
  await p.clock.resume();
  // the fixture's state; the server additionally has the match day of So 08.11
  await p.evaluate(()=>{
    const D=cd();window.__si={m:D.sessions.findIndex(s=>s.date==='So 08.11'),f:D.sessions.findIndex(s=>s.date==='Fr 06.11')};
    window.__old=JSON.parse(JSON.stringify(G));
    const S=JSON.parse(JSON.stringify(G)),B=S.db['U19__2026/27'];
    for(let i=0;i<10;i++)B.players[i].s[__si.m]=1;
    B.players[2].goals=[];B.players[2].goals[__si.m]=1;
    S._lastSaveBy='Ole Test';
    window.__server=S;
  });
  return {c,p,errs};
}
// what the server holds, decoded like the app does
const srv=p=>p.evaluate(()=>{const d=fbDecode(__FB.get('fcf_data'));const B=d.db['U19__2026/27'];
  return {m:B.players.slice(0,10).map(x=>x.s[__si.m]),g2:(B.players[2].goals||[])[__si.m]||null,
    f:B.players.map(x=>x.s[__si.f]),g:B.players.map(x=>(x.goals||[])[__si.m]||null)};});
const loc=p=>p.evaluate(()=>{const B=G.db['U19__2026/27'];return {m:B.players.slice(0,10).map(x=>x.s[__si.m]),g2:(B.players[2].goals||[])[__si.m]||null,
  f:B.players.map(x=>x.s[__si.f]),g:B.players.map(x=>(x.goals||[])[__si.m]||null)};});
const allOne=a=>a.every(v=>v===1);
// a real key press = a person did something (isTrusted)
const touch=p=>p.keyboard.press('Shift');
(async()=>{const b=await chromium.launch();
 // ══ A: altes Gerät startet, speichert automatisch, bevor es den Server sah ══
 {const {c,p,errs}=await boot(b);
  await p.evaluate(()=>startSync({server:__server,local:__old,hold:true,bootSave:true}));
  await wait(100);
  ok(await p.evaluate(()=>_pendingSave===true),'A: Start-Speichern wartet auf den ersten Stand');
  await p.evaluate(()=>__FB.deliver('fcf_data'));await wait(1500);
  const s=await srv(p),l=await loc(p);
  ok(allOne(s.m)&&s.g2===1,'A: Server behält den Spieltag (10× anwesend, Tor) — '+JSON.stringify(s.m));
  ok(allOne(l.m)&&l.g2===1,'A: das alte Gerät übernimmt den Server-Stand');
  ok(await p.evaluate(()=>!__FB.dataWrites().some(w=>JSON.stringify(w.update||w.set||{}).includes('/s/v/'+__si.m))),'A: kein Schreiben auf den Spieltag');
  ok(!errs.length,'A: keine Fehler');
  await c.close();}
 // ══ B: Person ändert etwas, bevor der erste Stand da ist ══
 {const {c,p,errs}=await boot(b);
  await p.evaluate(()=>startSync({server:__server,local:__old,hold:true}));
  await wait(50);await touch(p);
  await p.evaluate(()=>{G.db['U19__2026/27'].players[5].s[__si.f]=0;saveG(false);});
  await wait(50);
  await p.evaluate(()=>__FB.deliver('fcf_data'));await wait(1800);
  const s=await srv(p),l=await loc(p);
  ok(s.f[5]===0,'B: die Änderung kommt an (Spieler 6 am Fr 06.11 = F)');
  ok(allOne(s.m)&&s.g2===1,'B: und der Spieltag auf dem Server bleibt');
  ok(l.f[5]===0&&allOne(l.m)&&l.g2===1,'B: das Gerät hat danach beides');
  ok(!errs.length,'B: keine Fehler');
  await c.close();}
 // ══ C: anderer Trainer ändert, während die eigene Änderung noch wartet ══
 {const {c,p,errs}=await boot(b);
  await p.evaluate(()=>startSync({server:__server,local:__server}));await wait(400);
  await touch(p);
  await p.evaluate(()=>{G.db['U19__2026/27'].players[6].s[__si.f]=2;saveG(false);
    const k=encodeURIComponent('x');__FB.remote('fcf_data/db/U19__2026__SL__27/players/v/7/goals',{__arr:1,v:(()=>{const a=[];a[__si.m]=2;return a;})()});});
  await wait(1800);
  const s=await srv(p),l=await loc(p);
  ok(s.f[6]===2&&s.g[7]===2,'C: Server hat beides (eigene E, fremdes Tor)');
  ok(l.f[6]===2&&l.g[7]===2,'C: Gerät hat beides');
  ok(!errs.length,'C: keine Fehler');
  await c.close();}
 // ══ D: fremde Änderung, während die eigene Schreibung unterwegs ist ══
 {const {c,p,errs}=await boot(b);
  await p.evaluate(()=>startSync({server:__server,local:__server}));await wait(400);
  await p.evaluate(()=>{__FB.delay=700;});
  await touch(p);
  await p.evaluate(()=>{G.db['U19__2026/27'].players[8].s[__si.f]=0;saveG(false);});
  await wait(550);
  ok(await p.evaluate(()=>_fbSaving===true),'D: eigene Schreibung unterwegs');
  await p.evaluate(()=>{__FB.remote('fcf_data/db/U19__2026__SL__27/players/v/9/goals',{__arr:1,v:(()=>{const a=[];a[__si.m]=1;return a;})()});});
  await wait(2200);
  const s=await srv(p),l=await loc(p);
  ok(s.f[8]===0&&s.g[9]===1,'D: Server hat beides');
  ok(l.g[9]===1&&l.f[8]===0,'D: die fremde Änderung erscheint auf dem Gerät (nachgeholt)');
  ok(!errs.length,'D: keine Fehler');
  await c.close();}
 // ══ E: Löschen kommt an ══
 {const {c,p,errs}=await boot(b);
  await p.evaluate(()=>startSync({server:__server,local:__server}));await wait(400);
  await touch(p);
  await p.evaluate(()=>{G.db['U19__2026/27'].players[2].goals[__si.m]=null;saveG(false);});
  await wait(1500);
  const s=await srv(p);
  ok(s.g2===null,'E: gelöschtes Tor ist auf dem Server weg');
  ok(!errs.length,'E: keine Fehler');
  await c.close();}
 // ══ F: das Echo der eigenen Schreibung zeichnet nicht neu ══
 {const {c,p,errs}=await boot(b);
  await p.evaluate(()=>startSync({server:__server,local:__server}));await wait(400);
  await touch(p);
  const r0=await p.evaluate(()=>{G.db['U19__2026/27'].players[11].s[__si.f]=2;saveG(false);return window.__renders;});
  await wait(1500);
  const r1=await p.evaluate(()=>window.__renders);
  ok(r1===r0,'F: eigene Schreibung kommt zurück, ohne neu zu zeichnen ('+r0+' → '+r1+')');
  ok((await srv(p)).f[11]===2,'F: und ist auf dem Server');
  ok(!errs.length,'F: keine Fehler');
  await c.close();}
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);})();
