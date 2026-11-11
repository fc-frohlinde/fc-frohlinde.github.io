// 1.2.110 Erinnerungen einrichten. node tools/tests/t_psh110.js [index.html] [shotdir]
const {chromium}=require('playwright');const {NOW,setupTrainer,HTML}=require('./fx.js');
const html=HTML,out=process.argv[3]||'';let fails=0;const ok=(c,m)=>{console.log((c?'ok  ':'FAIL')+' '+m);if(!c)fails++;};
const txt=(d,sel)=>d.evaluate(s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\s+/g,' ').trim():'';},sel);
async function player(b,platform){
  const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const p=await c.newPage();await p.clock.install({time:NOW});
  const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message);});
  await p.goto('file://'+html);await p.waitForTimeout(800);
  await p.evaluate(`(${setupTrainer.toString()})({})`);
  await p.evaluate(async(pf)=>{const r=_pvBuildSync('U19','2026/27');const pp=r.people.find(x=>x.pi===2);
    const P=JSON.parse(JSON.stringify(Object.assign({},pp.obj,{tk:'t'.repeat(64),lk:'abcdef0123456789abcd'})));
    window._hubMode=true;window._hubAction=null;_pvAdopt({pk:'p'.repeat(64),t:Date.now(),P,T:JSON.parse(JSON.stringify(r.shared)),mvp:{},inbox:{}},pp.tok);_pmEnterSlice(pp.tok);
    window.__w=[];fbDb={ref:path=>({set:v=>{window.__w.push([path,v]);return Promise.resolve();},update:v=>Promise.resolve(),once:()=>Promise.resolve({val:()=>null}),on:()=>{},off:()=>{}})};
    // the platform
    _pushPub='key';window._pushPubDone=true;window._pushChecked=true;
    window.__plat=pf;// headless: Mitteilungen sonst „denied“; hier „default“ = noch nicht gefragt
    try{Object.defineProperty(Notification,'permission',{configurable:true,get:()=>window.__perm||'default'});}catch(e){}
    _a2hsIOS=()=>window.__plat.ios;_a2hsStandalone=()=>window.__plat.app;_pmIsStandalone=()=>window.__plat.app;_a2hsPhone=()=>true;
    window.__en=0;pushEnable=async(from)=>{window.__en++;window.__enFrom=from;window.__perm='granted';_pushOn=true;_pushRefreshUi(from);};
    try{localStorage.removeItem('fcf_push_later');}catch(e){}
    window._hubAction=null;renderPlayerMode();},platform);
  await p.waitForTimeout(250);
  return {c,p,errs};
}
(async()=>{const b=await chromium.launch();
 // ══ iPhone, Safari ══
 {const {c,p,errs}=await player(b,{ios:true,app:false});
  ok(await p.evaluate(()=>pushPlayerState())==='ios','iPhone in Safari: state ios');
  const card=await txt(p,'.hub-push');
  ok(/Erinnerungen aufs Handy/.test(card)&&/So geht’s/.test(card),'overview: the card with "So geht’s"');
  ok(await p.evaluate(()=>{const h=document.querySelector('#playerModeWrap .hub');const c=h.querySelector('.hub-push');const n=[...h.querySelectorAll('.fl-sec, .hub-sec, h2, .sec')][0];return !!c;}),'card on the overview');
  // the banner does not come on top
  await p.evaluate(()=>{_a2hsShown=false;_a2hsKind='player';try{localStorage.removeItem('fcf_a2hs');}catch(e){}_a2hsMaybe();});
  ok(!(await p.evaluate(()=>!!document.getElementById('a2hs'))),'no home-screen banner on top of it (iPhone, player)');
  await p.evaluate(()=>{document.querySelector('.hub-push .hub-push-on').click();});await p.waitForTimeout(200);
  const scr=await txt(p,'.psh');
  ok(/Erinnerungen aufs iPhone/.test(scr)&&/Auf „Teilen“ tippen/.test(scr)&&/Zum Home-Bildschirm/.test(scr)&&/Flutlicht auf dem Home-Bildschirm öffnen/.test(scr)&&/In Safari öffnen/.test(scr),'screen: three steps and the Safari hint');
  ok(await p.evaluate(()=>[...document.querySelectorAll('.psh-step')].map(x=>x.className.split(' ')[1]).join(','))==='now,now,next','steps: 1 and 2 here, 3 afterwards');
  ok(await p.evaluate(()=>/[?&]do=push(&|$)/.test(location.href)&&/[?&]p=/.test(location.href)),'address: own link with do=push (what the home-screen icon gets)');
  ok(!(await p.evaluate(()=>!!document.querySelector('.psh-go'))),'no switch-on button in Safari (it cannot work there)');
  if(out)await p.screenshot({path:out+'/p_ios_safari.png'});
  await p.evaluate(()=>document.querySelector('.psh .pm-top-back').click());await p.waitForTimeout(150);
  ok(await p.evaluate(()=>!!document.querySelector('#playerModeWrap .hub')&&!/do=/.test(location.href)),'Zurück: overview, address without do');
  // the thank-you after a rating
  await p.evaluate(()=>{localStorage.setItem('fcf_push_later',String(Date.now()+5*864e5));renderPlayerMode();_hubThanks('rpe');});await p.waitForTimeout(350);
  ok(/Beim nächsten Mal erinnern/.test(await txt(p,'#hubThanks')),'thank-you: the button also on the iPhone, also after "Später"');
  if(out)await p.screenshot({path:out+'/p_ios_danke.png'});
  await p.evaluate(()=>document.getElementById('hubThanksPush').click());await p.waitForTimeout(400);
  ok(!(await p.evaluate(()=>!!document.getElementById('hubThanks')))&&/Erinnerungen aufs iPhone/.test(await txt(p,'.psh')),'thank-you button: to the steps');
  await p.evaluate(()=>pushHowClose());await p.waitForTimeout(150);
  ok(await p.evaluate(()=>!!document.querySelector('#playerModeWrap .hub')),'from the thank-you, Zurück lands on the overview');
  ok(!errs.length,'iPhone Safari: no page errors');
  // ══ the same phone, now the app on the home screen, started at do=push ══
  await p.evaluate(()=>{window.__plat.app=true;try{localStorage.removeItem('fcf_push_later');}catch(e){}window._hubAction='push';renderPlayerMode();});await p.waitForTimeout(200);
  ok(await p.evaluate(()=>pushPlayerState())==='off','home-screen app: state off');
  const last=await txt(p,'.psh');
  ok(/Letzter Schritt/.test(last)&&/Auf „Einschalten“ tippen/.test(last),'home-screen app at do=push: "Letzter Schritt"');
  ok(await p.evaluate(()=>[...document.querySelectorAll('.psh-step')].map(x=>x.className.split(' ')[1]).join(','))==='done,done,now','steps: 1 and 2 done, 3 now');
  if(out)await p.screenshot({path:out+'/p_ios_app_letzter.png'});
  await p.evaluate(()=>document.querySelector('.psh-go').click());await p.waitForTimeout(250);
  ok(await p.evaluate(()=>window.__en===1&&window.__enFrom==='psh'),'Einschalten: asks for permission (once)');
  ok(/Erinnerungen sind an/.test(await txt(p,'.psh')),'then: "Erinnerungen sind an"');
  if(out)await p.screenshot({path:out+'/p_ios_app_an.png'});
  await p.evaluate(()=>document.querySelector('.psh-go').click());await p.waitForTimeout(150);
  ok(await p.evaluate(()=>!!document.querySelector('#playerModeWrap .hub')&&!document.querySelector('.hub-push')),'Zur Übersicht: no card any more');
  ok(/Erinnerungen an · ausschalten/.test(await txt(p,'.hub-push-line')),'foot line: on · ausschalten');
  // next start from the icon at do=push: straight to the overview
  await p.evaluate(()=>{window._hubAction='push';renderPlayerMode();});await p.waitForTimeout(150);
  ok(await p.evaluate(()=>!window._hubAction&&!!document.querySelector('#playerModeWrap .hub')&&!/do=/.test(location.href)),'later starts at do=push: the overview');
  ok(!errs.length,'iPhone app: no page errors');
  await c.close();}

 // ══ installed app, reminders off: the card stands on top ══
 {const {c,p,errs}=await player(b,{ios:true,app:true});
  const order=await p.evaluate(()=>{const h=document.querySelector('#playerModeWrap .hub');const all=[...h.children];const ci=all.findIndex(x=>x.classList&&x.classList.contains('hub-push'));const wi=all.findIndex(x=>x.classList&&x.classList.contains('fl-who'));return {ci,wi,n:h.querySelectorAll('.hub-push').length};});
  ok(order.n===1&&order.ci===order.wi+1,'home-screen app: the card right under the name, once ('+JSON.stringify(order)+')');
  if(out)await p.screenshot({path:out+'/p_app_karte_oben.png'});
  ok(!errs.length,'app overview: no page errors');
  await c.close();}

 // ══ Android, Chrome ══
 {const {c,p,errs}=await player(b,{ios:false,app:false});
  ok(await p.evaluate(()=>pushPlayerState())==='off','Android: state off');
  ok(await p.evaluate(()=>{const h=document.querySelector('#playerModeWrap .hub');const all=[...h.children];return all.findIndex(x=>x.classList&&x.classList.contains('hub-push'))>all.findIndex(x=>x.classList&&x.classList.contains('fl-who'))+1;}),'Android in the browser: the card where it was (not on top)');
  ok(/Einschalten/.test(await txt(p,'.hub-push')),'Android: card with "Einschalten"');
  await p.evaluate(()=>{_hubThanks('rpe');});await p.waitForTimeout(350);
  await p.evaluate(()=>document.getElementById('hubThanksPush').click());await p.waitForTimeout(250);
  ok(await p.evaluate(()=>window.__en===1&&window.__enFrom==='thanks'),'Android thank-you: switches on directly');
  ok(/Erinnerungen an/.test(await txt(p,'#hubThanksPush')),'thank-you button: "✓ Erinnerungen an"');
  await p.evaluate(()=>_hubThanksClose());await p.waitForTimeout(350);
  // the screen in the other states
  const st=await p.evaluate(()=>{const o={};const real=pushPlayerState;
    for(const s of ['denied','none']){pushPlayerState=()=>s;window._hubAction='push';renderPlayerMode();o[s]=document.querySelector('.psh').innerText.replace(/\s+/g,' ');}
    pushPlayerState=()=>'off';window.__plat.ios=false;window._hubAction='push';renderPlayerMode();o.off=document.querySelector('.psh').innerText.replace(/\s+/g,' ');
    pushPlayerState=real;return o;});
  ok(/Mitteilungen sind blockiert/.test(st.denied)&&/Berechtigungen/.test(st.denied),'denied: how to allow it');
  ok(/Hier geht es leider nicht/.test(st.none),'none: says so');
  ok(/Erinnerungen einschalten/.test(st.off)&&/ein Mal, nie nachts/.test(st.off)&&!/Teilen/.test(st.off),'Android off: one step, no iPhone steps');
  ok(!errs.length,'Android: no page errors');
  await c.close();}
 await b.close();console.log(fails?fails+' FAILED':'all ok');process.exit(fails?1:0);})();
