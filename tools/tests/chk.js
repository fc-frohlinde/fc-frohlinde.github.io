// Syntax der <script>-Blöcke und Klammern im CSS. node tools/tests/chk.js [index.html]
const fs=require('fs'),vm=require('vm'),path=require('path');
const f=path.resolve(process.argv[2]||path.join(__dirname,'..','..','index.html'));
const h=fs.readFileSync(f,'utf8');let bad=0,n=0;
for(const m of h.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)){
  if(/type=["'](?!text\/javascript|module)/.test(m[1]))continue;n++;
  try{new vm.Script(m[2],{filename:'script'+n});}catch(e){bad++;console.log('script '+n+': '+e.message);}
}
const css=[...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
const o=(css.match(/{/g)||[]).length,c=(css.match(/}/g)||[]).length;
console.log('scripts '+n+' bad '+bad+' css braces '+o+' '+c);process.exit(bad||o!==c?1:0);
