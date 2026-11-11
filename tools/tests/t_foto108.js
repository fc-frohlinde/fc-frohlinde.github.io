// 1.2.108 Einwilligung zum Foto. node tools/tests/t_foto108.js [index.html] [shotdir]
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');
const html=HTML,out=process.argv[3]||'';let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
const txt=(d,sel)=>d.evaluate(s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\s+/g,' ').trim():'';},sel);
// a real small image (canvas) so thumbnails work
const IMG=()=>{const c=document.createElement('canvas');c.width=c.height=120;const x=c.getContext('2d');x.fillStyle='#3a6';x.fillRect(0,0,120,120);x.fillStyle='#fff';x.beginPath();x.arc(60,50,26,0,7);x.fill();x.fillRect(25,80,70,40);return c.toDataURL('image/png');};
(async()=>{const b=await chromium.launch();
 // ══ player ══
 const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await c.newPage();await p.clock.install({time:NOW});
 const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
 await p.goto('file://'+html);await p.waitForTimeout(800);
 await p.evaluate(`(${setupTrainer.toString()})({})`);
 await p.evaluate(`(()=>{const im=(${IMG.toString()})();cd().players[2].photo=im;cd().players[3].photo=im;})()`);
 await p.evaluate(async()=>{const r=_pvBuildSync('U19','2026/27');const pp=r.people.find(x=>x.pi===2);
   const P=JSON.parse(JSON.stringify(Object.assign({},pp.obj,{tk:'t'.repeat(64),lk:'abcdef0123456789abcd'})));P.me.photo=await _pvThumb(pp.photo,160);
   window._hubMode=true;window._hubAction=null;_pvAdopt({pk:'p'.repeat(64),t:Date.now(),P,T:JSON.parse(JSON.stringify(r.shared)),mvp:{},inbox:{}},pp.tok);_pmEnterSlice(pp.tok);
   window.__w=[];fbDb={ref:path=>({set:v=>{window.__w.push([path,JSON.parse(JSON.stringify(v))]);return Promise.resolve();},once:()=>Promise.resolve({val:()=>null}),on:()=>{},off:()=>{}})};
   window.confirm=()=>true;window._hubAction=null;renderPlayerMode();});
 await p.waitForTimeout(300);
 const ask=await txt(p,'.foto-ask');
 ok(/Dein Foto in der App/.test(ask)&&/Spielerpass im DFBnet/.test(ask)&&/Ja, einverstanden/.test(ask)&&/Nein, löschen/.test(ask),'overview: the question, with where the photo comes from');
 if(out){const el=await p.$('.foto-ask');if(el)await el.screenshot({path:out+'/p_foto_frage.png'});}
 await p.evaluate(()=>fotoAnswer(1));await p.waitForTimeout(150);
 const w1=await p.evaluate(()=>window.__w);
 ok(w1.length===1&&/\/foto$/.test(w1[0][0])&&w1[0][1].a==='foto'&&w1[0][1].v===1,'yes: one entry "foto" v 1');
 ok(!(await p.evaluate(()=>!!document.querySelector('#playerModeWrap .hub .foto-ask'))),'yes: the question is gone');
 await p.evaluate(()=>hubPriv());await p.waitForTimeout(150);
 const pr=await txt(p,'.foto-priv');
 ok(/Du bist einverstanden seit/.test(pr)&&/Zurücknehmen – Foto löschen/.test(pr),'Datenschutz: the answer and how to take it back');
 if(out)await p.screenshot({path:out+'/p_foto_datenschutz.png'});
 await p.evaluate(()=>fotoAnswer(0,'priv'));await p.waitForTimeout(150);
 const w2=await p.evaluate(()=>window.__w[window.__w.length-1]);
 ok(w2[1].v===0&&!(await p.evaluate(()=>cd().players[CU.playerIdx].photo)),'taken back: entry v 0, the photo gone at once');
 ok(/Du hast nein gesagt/.test(await txt(p,'.foto-priv'))&&/Doch einverstanden/.test(await txt(p,'.foto-priv')),'Datenschutz: no, and a way back');
 ok(/dein Foto dort nur, wenn du zugestimmt hast/.test(await txt(p,'.fl-priv'))&&/Nach dem Foto fragt dich die App/.test(await txt(p,'.fl-priv')),'Datenschutzhinweise say it');
 ok(!errs.length,'player: no page errors');
 await c.close();

 // ══ trainers ══
 const c2=await b.newContext({viewport:{width:1440,height:900}});const d=await c2.newPage();await d.clock.install({time:NOW});
 const e2=[];d.on('pageerror',e=>{e2.push(e.message);console.log('PAGEERR',e.message);});
 await d.goto('file://'+html);await d.waitForTimeout(800);
 await d.evaluate(`(${setupTrainer.toString()})({})`);
 await d.evaluate(`(()=>{const im=(${IMG.toString()})();[1,2,3].forEach(i=>{cd().players[i].photo=im;});})()`);
 // the "Immer dabei" wall for the players: only with a yes
 const wall=await d.evaluate(()=>{const D=cd();D.players[1].fotoOk={v:1,t:Date.now()};D.players[3].fotoOk={v:0,t:Date.now()};
   const r={players:[1,2,3].map(i=>({name:D.players[i].name,_pi:i,photo:D.players[i].photo,wTotal:2,wPct:100}))};
   return _reportForPlayers(r,null).fullP.map(x=>!!x.photo);});
 ok(JSON.stringify(wall)==='[true,false,false]','"Immer dabei" for players: photo only with yes ('+wall+')');
 // a no merged: photo, id and stored image gone
 const m=await d.evaluate(()=>{const D=cd(),q=D.players[2];q._mid_photo='mtest1';MEDIA.photos.mtest1=q.photo;
   const r=pvApply(D,2,{a:'foto',v:0,t:Date.now()},teamRules('U19'));if(r.media)_photoDropMedia(r.media);
   return {ok:r.ok,f:r.f.join(','),photo:!!q.photo,mid:q._mid_photo,med:MEDIA.photos.mtest1===undefined,dirty:!!_mediaDirty.mtest1,aud:r.audit&&r.audit.details};});
 ok(m.ok&&!m.photo&&!m.mid&&m.med&&m.dirty&&/gelöscht/.test(m.aud),'no: photo, its id and the stored image deleted ('+JSON.stringify(m)+')');
 // profile: the answer
 await d.evaluate(()=>openPlayerStats(1));await d.waitForTimeout(250);
 ok(/Foto\s*einverstanden \(\d+\.\d+\.\)/.test(await d.evaluate(()=>document.getElementById('moPlayer').innerText)),'profile: "Foto einverstanden (date)"');
 await d.evaluate(()=>{closeM('moPlayer');openPlayerStats(5);});await d.waitForTimeout(200);
 await d.evaluate(`(()=>{const im=(${IMG.toString()})();cd().players[5].photo=im;openPlayerStats(5);})()`);await d.waitForTimeout(200);
 ok(/noch nicht gefragt – Mitspieler sehen es noch nicht/.test(await d.evaluate(()=>document.getElementById('moPlayer').innerText)),'profile: not asked yet');
 // uploading against his no: asked first
 const asked=await d.evaluate(()=>{closeM('moPlayer');openPlayerStats(2);let q='';window.confirm=t=>{q=t;return false;};pickPlayerPhoto();return q;});
 ok(/nicht zugestimmt/.test(asked),'upload against his no: the trainer is asked first');
 // removing by the trainer: id and image too
 const rm=await d.evaluate(()=>{window.confirm=()=>true;closeM('moPlayer');const D=cd(),q=D.players[1];q._mid_photo='mtest2';MEDIA.photos.mtest2=q.photo;openPlayerStats(1);removePlayerPhoto();
   return {photo:!!q.photo,mid:q._mid_photo,med:MEDIA.photos.mtest2===undefined};});
 ok(!rm.photo&&!rm.mid&&rm.med,'trainer removes a photo: id and stored image too');
 // slice: his answer in his own record
 const sl=await d.evaluate(()=>{const r=_pvBuildSync('U19','2026/27');return JSON.stringify(r.people.find(x=>x.pi===2).obj.me.fotoOk||null);});
 ok(/"v":0/.test(sl),'his own slice carries his answer');
 ok(!e2.length,'trainers: no page errors');
 await c2.close();
 await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
})();
