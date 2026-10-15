import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const src=fs.readFileSync(path.join(here,'chat-experience.mjs'),'utf8');
const checks=[
 ['app uses dynamic viewport', src.includes('height:100dvh')],
 ['main can shrink in grid', src.includes('.main{min-width:0;min-height:0;height:100%;overflow:hidden;')],
 ['sidebar can shrink', src.includes('min-width:0;min-height:0;overflow:hidden')],
 ['chat vertical scroll enabled', src.includes('overflow-y:auto;overscroll-behavior-y:contain;scrollbar-gutter:stable;touch-action:pan-y')],
 ['settings overlay scroll enabled', src.includes('.settings-overlay{') && src.includes('overflow-y:auto;overscroll-behavior:contain')],
 ['settings card constrained', src.includes('max-height:calc(100dvh - 40px);overflow-y:auto')],
 ['hotfix label', src.includes('IA local · V3.1')],
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`); if(ok) pass++;}
console.log(`${pass}/${checks.length} PASS`);
if(pass!==checks.length) process.exit(1);
