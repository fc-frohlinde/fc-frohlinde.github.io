// Testdaten für die Browser-Tests (alle Namen erfunden).
// U19 2026/27, Uhr: Sa 07.11.2026 10:00 (Berlin). Trainings Di/Fr 18:30
// (90 Min., Schwerpunkt Di „Pressing“, Fr „Spielaufbau“) vom 01.09. bis 20.11.,
// Spiele sonntags 13:00 bis 22.11. Rückfragen (confirm) werden bejaht.
// Vergangene Termine: meist anwesend, einzelne F/E; künftige: „M“ durch die
// Antwort-Regel (wie bei der U19). Angemeldet als Admin, ohne Firebase.
//
//   const {NOW,setupTrainer,HTML}=require('./fx.js');
//   await page.clock.install({time:NOW});
//   await page.goto('file://'+HTML);
//   await page.evaluate(`(${setupTrainer.toString()})({night:false})`);
//
// setupTrainer läuft IN der Seite (toString) und darf nichts von außen benutzen.
const path=require('path');
const NOW=new Date('2026-11-07T10:00:00+01:00');
const HTML=path.resolve(process.argv[2]||path.join(__dirname,'..','..','index.html'));
function setupTrainer(opt){
  opt=opt||{};
  window.__dl=[];
  window.alert=m=>{window.__dl.push(String(m));};
  window.confirm=m=>{window.__dl.push(String(m));return true;}; // Rückfragen: „OK“
  // keine Verbindung zu Firebase
  loadFbConfig=()=>null;
  try{localStorage.clear();sessionStorage.clear();}catch(e){}
  const team='U19',season='2026/27',key=team+'__'+season;
  const opp=['SV Westfeld','TuS Lindenau','SC Bergheim','FC Grünau','DJK Talblick','SpVg Ostring','VfL Mühlenbach','BV Kreuzweg','TSV Auental','SG Heidekamp','RW Seefeld','FC Schlossberg'];
  const sessions=[];
  let mi=0;
  for(let t=Date.UTC(2026,8,1);t<=Date.UTC(2026,10,22);t+=864e5){
    const d=new Date(t),dw=d.getUTCDay(),iso=d.toISOString().slice(0,10),disp=DOW[dw]+' '+iso.slice(8,10)+'.'+iso.slice(5,7),mo=moFromDisp(disp); // „So 08.11“ wie in den echten Daten
    if((dw===2||dw===5)&&t<=Date.UTC(2026,10,20))sessions.push({date:disp,month:mo,type:'training',focus:dw===2?'Pressing':'Spielaufbau',time:'18:30',dur:90,location:'Kunstrasen'});
    if(dw===0&&t>=Date.UTC(2026,8,6)){const h=mi%2===0;sessions.push({date:disp,month:mo,type:'match',homeAway:h?'home':'away',label:opp[mi%opp.length],time:'13:00',location:h?'Kunstrasen':''});mi++;}
  }
  const P=[['Jan Hoffstedt','TW',1],['Ali Kaya','IV',4],['Tom Berg','IV',5],['Max Neumann','RV',2],['Finn Wolf','LV',3],
    ['Noah Becker','6er',6],['Leon Schulz','8er',8],['Jonas Kraus','8er',16],['Emil Hartmann','10er',10],['Ben Vogel','RF',7],
    ['Luca Brandt','LF',11],['Paul Richter','ST',9],['Mats Lange','ST',19],['Elias Roth','6er',14],['Mika Busch','TW',12]];
  const isPast=s=>{const m=s.date.match(/(\d+)\.(\d+)/);const dd=+m[1],mm=+m[2];const y=mm>=7?2026:2027;
    const [hh,mn]=(s.time||'00:00').split(':').map(Number);return Date.UTC(y,mm-1,dd,hh-1,mn)+(s.dur||105)*6e4<Date.now();};
  const players=P.map(([name,pos,nr],pi)=>{
    const p={nr,name,pos,pos2:'',birthdate:'200'+(7+pi%2)+'-'+String(1+pi%12).padStart(2,'0')+'-'+String(3+pi).padStart(2,'0'),
      joinDate:'2026-07-01',foot:pi%4===3?'left':'right',confirmToken:(pi+1).toString(16).padStart(2,'0').repeat(10),s:[],ay:[]};
    sessions.forEach((s,si)=>{
      if(isPast(s)){const r=(pi*7+si*3)%17;p.s[si]=r===0?0:(r===5?2:1);p.ay[si]=null;}
      else{p.s[si]=4;p.ay[si]=1;}
    });
    return p;
  });
  G=sanitizeG({version:14,teamList:[team],seasonList:[season],currentSeason:season,
    trainers:[{name:'Ole Test',teams:[team],role:'Trainer'}],
    db:{[key]:{sessions,players},[team+'__rules']:{autoYes:{t:true,m:true},abs:{m:'anruf'}},[team+'__focuses']:[...DEF_FOCUSES]},
    auditLog:[]});
  if(!Array.isArray(G.auditLog))G.auditLog=[];
  UI.currentTeam=team;UI.currentSeason=season;
  try{localStorage.setItem('fcf_currentTeam',team);localStorage.setItem('fcf_currentSeason',season);}catch(e){}
  CU={name:'Admin',role:'admin',teams:[],loginAt:Date.now()};
  const ao=document.getElementById('authOverlay');if(ao)ao.classList.remove('open');
  showApp();
  if(opt.night)setHxPreset('nacht');
  const h=document.getElementById('homeOverlay');if(h)h.style.display='none';
  try{hxRender();}catch(e){}
}
module.exports={NOW,HTML,setupTrainer};
