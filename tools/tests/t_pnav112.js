// 1.2.112 In Profil, Termin und Trainer blättern: ‹ Liste n/m › oben im Panel.
// node tools/tests/t_pnav112.js [index.html] [shotdir]
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');
const html=HTML,out=process.argv[3]||'';let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
async function page(b,w,h,opt){
  opt=opt||{};
  const c=await b.newContext({viewport:{width:w,height:h},isMobile:!!opt.mobile,hasTouch:!!opt.mobile});const p=await c.newPage();await p.clock.install({time:NOW});
  const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
  await p.goto('file://'+html);await p.waitForTimeout(700);
  await p.evaluate(`(${setupTrainer.toString()})(${JSON.stringify({night:!!opt.night})})`);
  await p.waitForTimeout(200);
  return {c,p,errs};
}
const st=p=>p.evaluate(()=>{const k=PNAV.k;const el=document.getElementById('pnav-'+k);const c=el&&el.querySelector('.pnav-c');
  const L=_pnavList();return {k,i:PNAV.i,label:c?c.querySelector('.pnav-l').textContent:'',n:c?c.querySelector('b').textContent:'',
  list:L.map(x=>x.k+x.i).join(','),prevDis:!!(el&&el.querySelector('.pnav-a')&&el.querySelectorAll('.pnav-a')[0].disabled),nextDis:!!(el&&el.querySelectorAll('.pnav-a')[1]&&el.querySelectorAll('.pnav-a')[1].disabled),
  name:(document.getElementById('ps-name')||{}).textContent,ss:(document.getElementById('ss-title')||{}).textContent,
  pOpen:document.getElementById('moPlayer').classList.contains('open'),sOpen:document.getElementById('moSession2').classList.contains('open')};});
(async()=>{const b=await chromium.launch();
 {const {c,p,errs}=await page(b,1536,730);
  // ══ ohne Liste: Spieler nach Nummer ══
  await p.evaluate(()=>openPlayerStats(3));await p.waitForTimeout(300);   // Max Neumann #2
  let s=await st(p);
  ok(s.k==='p'&&s.label==='Kader'&&s.n==='2/15','direkt geöffnet: „Kader 2/15“ (nach Nummer): '+s.label+' '+s.n);
  await p.click('#pnav-p .pnav-a:last-child');await p.waitForTimeout(250);
  s=await st(p);ok(s.name==='Finn Wolf'&&s.n==='3/15','› : nächste Nummer (#3 Finn Wolf): '+s.name);
  await p.click('#pnav-p .pnav-a:first-child');await p.click('#pnav-p .pnav-a:first-child');await p.waitForTimeout(250);
  s=await st(p);ok(s.name==='Jan Hoffstedt'&&s.prevDis&&!s.nextDis,'‹ ‹ : #1, am Anfang ist ‹ aus');
  await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowRight');await p.waitForTimeout(250);
  s=await st(p);ok(s.name==='Finn Wolf','Taste → zweimal: #3 '+s.name);
  // ══ Liste: suchen und springen ══
  await p.click('#pnav-p .pnav-c');await p.waitForTimeout(150);
  ok(await p.evaluate(()=>document.querySelectorAll('#pnavMenu .pnav-it').length===15&&!!document.querySelector('#pnavMenu .pnav-it.on')),'Liste: 15 Spieler, der aktuelle markiert');
  if(out)await p.screenshot({path:out+'/pnav_liste.png'});
  await p.fill('#pnavMenu .pnav-q','berg');await p.waitForTimeout(100);
  {const r=await p.evaluate(()=>[...document.querySelectorAll('#pnavMenu .pnav-it')].map(e=>cd().players[+e.dataset.i].name).join());ok(r==='Tom Berg','Suche „berg“: nur Tom Berg ('+r+')');}
  await p.click('#pnavMenu .pnav-it');await p.waitForTimeout(250);
  s=await st(p);ok(s.name==='Tom Berg'&&!(await p.evaluate(()=>!!document.getElementById('pnavMenu'))),'Klick: Tom Berg, Liste zu');
  await p.click('#pnav-p .pnav-c');await p.keyboard.press('Escape');await p.waitForTimeout(100);
  ok(await p.evaluate(()=>!document.getElementById('pnavMenu')&&document.getElementById('moPlayer').classList.contains('open')),'Esc schließt nur die Liste, das Profil bleibt');
  // Tippen in einem Feld blättert nicht
  await p.evaluate(()=>{const i=document.createElement('input');i.id='tmpI';document.querySelector('#moPlayer .mob').appendChild(i);i.focus();});
  await p.keyboard.press('ArrowRight');await p.waitForTimeout(150);
  s=await st(p);ok(s.name==='Tom Berg','in einem Eingabefeld: → blättert nicht');
  await p.evaluate(()=>{document.getElementById('tmpI').remove();document.activeElement&&document.activeElement.blur&&document.activeElement.blur();});
  await p.evaluate(()=>psCloseGuard());await p.waitForTimeout(200);
  ok(await p.evaluate(()=>PNAV.k===''&&PNAV.list===null),'Panel zu: Liste vergessen');

  // ══ aus der Tabelle Anwesenheit: in ihrer Reihenfolge ══
  const rows=await p.evaluate(()=>[...document.querySelectorAll('#mainTable tbody td.c1[onclick]')].filter(e=>e.getClientRects().length).map(e=>+e.getAttribute('onclick').match(/\d+/)[0]));
  await p.click('#mainTable tbody tr:nth-child(5) td.c1');await p.waitForTimeout(300);
  s=await st(p);
  ok(s.label==='Anwesenheit'&&s.n==='5/'+rows.length&&s.list===rows.map(i=>'p'+i).join(','),'aus der Tabelle: „Anwesenheit 5/'+rows.length+'“ in Tabellenreihenfolge ('+s.label+' '+s.n+')');
  await p.keyboard.press('ArrowRight');await p.waitForTimeout(250);
  s=await st(p);ok(s.i===rows[5],'→ : die nächste Zeile der Tabelle');
  // ein anderer Spieler aus derselben Tabelle: Liste bleibt
  await p.click('#mainTable tbody tr:nth-child(2) td.c1');await p.waitForTimeout(300);
  s=await st(p);ok(s.n==='2/'+rows.length,'anderer Klick in der Tabelle: 2/'+rows.length);
  await p.evaluate(()=>psCloseGuard());await p.waitForTimeout(150);

  // ══ aus „Wer kommt?“: die Gruppe „Offen“ ══
  const si=await p.evaluate(()=>{const D=cd();const si=D.sessions.findIndex(s=>s.date==='Di 10.11');[2,5,9].forEach(i=>{D.players[i].s[si]=3;D.players[i].ay[si]=null;});D.players[7].s[si]=0;return si;});
  await p.evaluate(si=>openSessStats(si),si);await p.waitForTimeout(400);
  s=await st(p);ok(s.k==='s'&&s.label==='Termine','Termin direkt: „Termine“ (nach Datum)');
  const grp=await p.evaluate(()=>{const g=[...document.querySelectorAll('#moSession2 .ssx-grp')].find(x=>x.dataset.st==='3');return g?{l:g.dataset.pnl,n:g.querySelectorAll('.ssx-chip').length}:null;});
  ok(grp&&grp.n===3,'Gruppe „'+(grp&&grp.l)+'“ mit 3 Spielern');
  await p.click('#moSession2 .ssx-grp[data-st="3"] .ssx-chip >> nth=1');await p.waitForTimeout(200);
  await p.click('#ssx-menu button:has-text("Spielerprofil")');await p.waitForTimeout(400);
  s=await st(p);
  ok(s.pOpen&&s.label===grp.l&&s.n==='2/3','über das Menü zum Profil: „'+grp.l+' 2/3“ ('+s.label+' '+s.n+')');
  await p.click('#pnav-p .pnav-a:last-child');await p.waitForTimeout(250);
  s=await st(p);ok(s.n==='3/3'&&s.nextDis,'› : der Letzte aus „'+grp.l+'“, › aus');
  if(out)await p.screenshot({path:out+'/pnav_offen.png'});
  await p.evaluate(()=>psCloseGuard());await p.waitForTimeout(150);

  // ══ Termine nach Datum, Liste mit KW ══
  await p.evaluate(si=>openSessStats(si),si);await p.waitForTimeout(300);
  const before=await st(p);
  await p.click('#pnav-s .pnav-a:last-child');await p.waitForTimeout(300);
  s=await st(p);ok(/^Fr 13\.11/.test(s.ss),'Termin › : Fr 13.11 ('+s.ss+')');
  await p.keyboard.press('ArrowRight');await p.waitForTimeout(300);
  s=await st(p);ok(/^So 15\.11/.test(s.ss),'Termin → : So 15.11 – Spiel ('+s.ss+')');
  await p.click('#pnav-s .pnav-c');await p.waitForTimeout(150);
  const kw=await p.evaluate(()=>[...document.querySelectorAll('#pnavMenu .pnav-kw')].map(e=>e.textContent));
  const noQ=await p.evaluate(()=>!document.querySelector('#pnavMenu .pnav-q'));
  ok(kw.includes('KW 46')&&kw.includes('KW 47')&&noQ,'Terminliste mit Kalenderwochen, ohne Suche');
  if(out)await p.screenshot({path:out+'/pnav_termine.png'});
  await p.keyboard.press('Escape');
  await p.evaluate(()=>closeM('moSession2'));await p.waitForTimeout(150);

  // ══ Im Blick: gemischt Spieler und Termine ══
  await p.evaluate(()=>{document.getElementById('homeOverlay').style.display='';hxRender();});await p.waitForTimeout(300);
  const fl=await p.evaluate(()=>_pnavUniq((window._hxFlagsList||[]).map(f=>_pnavOf(f.on)).filter(Boolean)).map(x=>x.k+x.i));
  const first=await p.evaluate(()=>{const b=[...document.querySelectorAll('#hxHome .hx-a-flags .hx-flag')].find(e=>_pnavOf(e.getAttribute('onclick')));return b?[...document.querySelectorAll('#hxHome .hx-a-flags .hx-flag')].indexOf(b):-1;});
  if(fl.length>=2&&first>=0){
    await p.click(`#hxHome .hx-a-flags .hx-flag >> nth=${first}`);await p.waitForTimeout(400);
    s=await st(p);ok(s.label==='Im Blick'&&s.list===fl.join(','),'aus Im Blick: alle Einträge mit Profil oder Termin ('+fl.length+'): '+s.label+' '+s.n);
    const kinds=new Set(fl.map(x=>x[0]));
    if(kinds.size>1){
      // blättern bis der andere Typ kommt: das Panel wechselt
      const k0=s.k;let sw=false;for(let j=0;j<fl.length;j++){await p.keyboard.press('ArrowRight');await p.waitForTimeout(250);const t=await st(p);if(t.k!==k0){sw=t.k==='s'?t.sOpen&&!t.pOpen:t.pOpen&&!t.sOpen;break;}}
      ok(sw,'Im Blick gemischt: blättern wechselt zwischen Profil und Termin');
    }else ok(true,'Im Blick: nur eine Art ('+[...kinds]+')');
    await p.evaluate(()=>{closeM('moPlayer');closeM('moSession2');});
  }else ok(true,'Im Blick: zu wenige Einträge in den Testdaten ('+fl.length+')');
  ok(!errs.length,'1536: keine Fehler');
  await c.close();}

 // ══ Trainer ══
 {const {c,p,errs}=await page(b,1536,730);
  await p.evaluate(()=>{G.trainers.push({name:'Uwe Test',teams:['U19'],role:'Trainer'});openTrainerProfile(0);});await p.waitForTimeout(300);
  let s=await st(p);ok(s.k==='t'&&s.label==='Trainer'&&s.n==='1/2','Trainerprofil: „Trainer 1/2“');
  await p.click('#pnav-t .pnav-a:last-child');await p.waitForTimeout(250);
  ok(/Uwe Test/.test(await p.evaluate(()=>document.getElementById('tp-content').innerText)),'› : der zweite Trainer');
  // nur ein Trainer: keine Pfeile
  await p.evaluate(()=>{tpCloseGuard();G.trainers.pop();openTrainerProfile(0);});await p.waitForTimeout(200);
  ok(await p.evaluate(()=>document.getElementById('pnav-t').innerHTML===''),'ein einziger Trainer: keine Pfeile');
  ok(!errs.length,'Trainer: keine Fehler');
  await c.close();}

 // ══ ungespeicherte Änderung im Profil: fragt vor dem Blättern ══
 {const {c,p,errs}=await page(b,1536,730);
  await p.evaluate(()=>{openPlayerStats(3);});await p.waitForTimeout(250);
  const asked=await p.evaluate(()=>{window.__dl.length=0;_psIsDirty=()=>true;const box=document.getElementById('ps-edit');if(box)box.style.display='block';pnavStep(1);return window.__dl.some(m=>/Änderungen speichern/.test(m));});
  ok(asked,'Bearbeiten mit Änderungen: Frage „Änderungen speichern?“ vor dem Wechsel');
  ok(!errs.length,'Bearbeiten: keine Fehler');
  await c.close();}

 // ══ Telefon und Nacht ══
 for(const night of [false,true]){
  const {c,p,errs}=await page(b,390,844,{mobile:true,night});
  await p.evaluate(()=>openPlayerStats(3));await p.waitForTimeout(400);
  const g=await p.evaluate(()=>{const r=document.querySelector('#moPlayer .ps-title-row');const pn=document.getElementById('pnav-p');const l=pn.querySelector('.pnav-l');
    return {fit:r.scrollWidth<=r.clientWidth+1,vis:pn.getBoundingClientRect().width>60,lab:l?getComputedStyle(l).display:'?',right:pn.getBoundingClientRect().right<=390};});
  ok(g.fit&&g.vis&&g.lab==='none'&&g.right,'Telefon'+(night?' Nacht':'')+': Pfeile passen in die Kopfzeile, ohne Wort ('+JSON.stringify(g)+')');
  await p.click('#pnav-p .pnav-a:last-child');await p.waitForTimeout(300);
  ok((await st(p)).name==='Finn Wolf','Telefon'+(night?' Nacht':'')+': › funktioniert');
  if(out)await p.screenshot({path:out+'/pnav_tel'+(night?'_nacht':'')+'.png'});
  if(night){await p.click('#pnav-p .pnav-c');await p.waitForTimeout(150);if(out)await p.screenshot({path:out+'/pnav_tel_nacht_liste.png'});}
  ok(!errs.length,'Telefon'+(night?' Nacht':'')+': keine Fehler');
  await c.close();
 }
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);})();
