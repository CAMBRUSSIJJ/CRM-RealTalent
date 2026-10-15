import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(path.join(root,'chat-experience.mjs'),'utf8');
const tests = [
  ['auto-follow state exists', src.includes('autoFollowThread=true')],
  ['near-bottom detector exists', src.includes('function threadNearBottom(')],
  ['manual scroll updates follow state', src.includes("addEventListener('scroll'") && src.includes('autoFollowThread=threadNearBottom(chatScrollEl)')],
  ['wheel up disables follow', src.includes("if(e.deltaY<0)autoFollowThread=false")],
  ['render is conditional', src.includes('const shouldFollow=forceFollow||autoFollowThread||threadNearBottom(scroll)')],
  ['old unconditional scroll removed', !src.includes("requestAnimationFrame(()=>{$('#chatScroll').scrollTop=$('#chatScroll').scrollHeight})")],
  ['open conversation only forces once', src.includes('autoFollowThread=true;renderThread(true)')],
  ['new send resumes follow', src.includes("autoFollowThread=true;$('#sendBtn').disabled=true;renderThread(true)")],
];
let pass=0;
for (const [name, ok] of tests) { console.log(`${ok?'PASS':'FAIL'} - ${name}`); if(ok) pass++; }
console.log(`${pass}/${tests.length} PASS`);
process.exit(pass===tests.length?0:1);
