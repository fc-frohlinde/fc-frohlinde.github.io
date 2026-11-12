// Firebase im Speicher für die Sync-Tests: ein „Server“ mit Baum, Listenern und
// den Schreibweisen, die die App benutzt (on/once/set/update/push/remove/
// transaction). Wie die echte Realtime Database feuern die eigenen Listener
// eines Geräts sofort beim Schreiben (lokales Ereignis), das Promise kommt
// danach (__FB.delay ms). Andere Geräte: __FB.remote(pfad, wert).
//
//   await page.evaluate(`(${installFake.toString()})()`);
//   await page.evaluate(`(${startSync.toString()})(${JSON.stringify(opt)})`);
//
// Beide Funktionen laufen IN der Seite (toString) und dürfen nichts von außen benutzen.
function installFake(){
  const clone=v=>v===undefined?null:JSON.parse(JSON.stringify(v));
  const seg=p=>String(p||'').split('/').filter(Boolean);
  const F=window.__FB={tree:{},ls:[],writes:[],delay:0,hold:{},log:[]};
  F.get=p=>{let o=F.tree;for(const k of seg(p)){if(o==null||typeof o!=='object')return null;o=o[k];}return o===undefined?null:clone(o);};
  F.put=(p,v)=>{
    const s=seg(p);if(!s.length){F.tree=v==null?{}:clone(v);return;}
    let o=F.tree;for(const k of s.slice(0,-1)){if(o[k]==null||typeof o[k]!=='object')o[k]={};o=o[k];}
    const last=s[s.length-1];
    if(v==null){if(Array.isArray(o))o[+last]=null;else delete o[last];}else o[last]=clone(v);
  };
  const snap=(p,key)=>({val:()=>F.get(p),exists:()=>F.get(p)!=null,key:key||seg(p).pop()||null,
    forEach:fn=>{const v=F.get(p)||{};Object.keys(v).forEach(k=>fn(snap(p+'/'+k,k)));}});
  const within=(a,b)=>{const A=seg(a),B=seg(b);return A.length<=B.length&&A.every((x,i)=>x===B[i]);};
  F.notify=p=>{F.ls.slice().forEach(l=>{if(l.ev==='value'&&(within(l.p,p)||within(p,l.p)))try{l.cb(snap(l.p));}catch(e){console.error('[fake listener]',e);}});};
  F.deliver=p=>{F.hold[p]=false;F.ls.filter(l=>l.p===p&&l.ev==='value').forEach(l=>l.cb(snap(l.p)));};
  F.remote=(p,v)=>{F.put(p,v);F.log.push({remote:p});F.notify(p);};
  const done=()=>new Promise(r=>setTimeout(r,F.delay||0));
  let pushN=0;
  const ref=p=>{
    p=seg(p).join('/');
    const R={
      key:seg(p).pop()||null,
      child:c=>ref(p+'/'+c),
      on:(ev,cb,err)=>{F.ls.push({p,ev,cb});if(ev==='value'&&!F.hold[p])setTimeout(()=>{if(!F.hold[p])cb(snap(p));},0);return cb;},
      off:(ev,cb)=>{F.ls=F.ls.filter(l=>!(l.p===p&&(!cb||l.cb===cb)));},
      once:(ev,cb)=>{const s=snap(p);if(typeof cb==='function')cb(s);return Promise.resolve(s);},
      set:v=>{F.writes.push({p,set:clone(v)});F.put(p,v);F.notify(p);return done();},
      update:o=>{F.writes.push({p,update:clone(o)});for(const k of Object.keys(o))F.put(p+'/'+k,o[k]);F.notify(p);return done();},
      remove:()=>R.set(null),
      push:v=>{const k='-k'+String(++pushN).padStart(6,'0');const c=ref(p+'/'+k);const pr=v===undefined?Promise.resolve():c.set(v);c.then=(a,b)=>pr.then(a,b);return c;},
      transaction:(fn,cb,applyLocally)=>{
        const cur=F.get(p);const nv=fn(cur);
        if(nv===undefined){const r={committed:false,snapshot:snap(p)};if(cb)cb(null,false,r.snapshot);return Promise.resolve(r);}
        F.writes.push({p,tx:clone(nv)});F.put(p,nv);F.notify(p);
        const r={committed:true,snapshot:snap(p)};if(cb)cb(null,true,r.snapshot);return done().then(()=>r);
      },
      onDisconnect:()=>({set:()=>Promise.resolve(),remove:()=>Promise.resolve(),cancel:()=>Promise.resolve(),update:()=>Promise.resolve()}),
      orderByChild:()=>R,orderByKey:()=>R,limitToLast:()=>R,limitToFirst:()=>R,startAt:()=>R,endAt:()=>R,equalTo:()=>R
    };
    return R;
  };
  F.db={ref:p=>ref(p||'')};
  // writes to the data node only (not slices, inbox, journal pushes …)
  F.dataWrites=()=>F.writes.filter(w=>w.p==='fcf_data'&&(w.update||w.set));
}
// Start the trainer app's sync on a device whose copy is `local` (a G object),
// against a server holding `server` (a G object). opt.hold: the first snapshot
// only comes with __FB.deliver('fcf_data').
function startSync(opt){
  const F=window.__FB;
  F.tree={fcf_data:fbEncode(JSON.parse(JSON.stringify(opt.server)))};
  F.hold={fcf_data:!!opt.hold};
  F.writes.length=0;F.log.length=0;
  // the device starts with its cached copy, as loadG() leaves it
  G=sanitizeG(JSON.parse(JSON.stringify(opt.local)));
  _bootJSON=JSON.stringify(G);
  _fbBase=null;_fbShadow=null;_fbBaseAt=0;_fbLateRaw=undefined;
  _fbInitialLoaded=false;fbListening=false;_pendingSave=false;_fbSaving=false;
  clearTimeout(_fbDebounce);_fbDebounce=null;
  _fbNeedsAcct=()=>false;
  fbDb=F.db;fbRef=F.db.ref('fcf_data');
  window.__renders=0;
  if(!window.__renderWrapped){const r=render;render=function(){window.__renders++;return r.apply(this,arguments);};window.__renderWrapped=true;}
  try{render();}catch(e){}
  if(opt.bootSave)saveG(false);   // an automatic save at start, before anyone touched anything
  startFbListener();
}
module.exports={installFake,startSync};
