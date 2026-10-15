import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const here=path.dirname(fileURLToPath(import.meta.url))
let ok=0;const t=(n,p)=>{console.log(`${p?'OK  ':'FAIL'} ${n}`);if(p)ok++}
const pkg=JSON.parse(fs.readFileSync(path.join(here,'package.json'),'utf8'))
const ds=JSON.parse(fs.readFileSync(path.join(here,'MODEL_CALIBRATION_DATASET_V3.1.1.json'),'utf8'))
const manifest=fs.readFileSync(path.join(here,'platform-manifest.mjs'),'utf8')
const setup=fs.readFileSync(path.join(here,'setup-agent-linux.sh'),'utf8')
const root=path.dirname(here),launcher=fs.readFileSync(path.join(root,'realtalent-agent.sh'),'utf8')
t('calibration compatibility package line',pkg.version.startsWith('3.1.'))
t('calibration scripts registered',Boolean(pkg.scripts['calibration:selftest'])&&Boolean(pkg.scripts['calibration:status']))
t('dataset V3.1.1',ds.version==='3.1.1'&&ds.tasks.length>=10)
t('four model roles covered',new Set(ds.tasks.map(x=>x.role)).size===4)
t('human A/B prompts present',(ds.humanPrompts||[]).length>=5)
t('platform capability advertised',manifest.includes('model-human-quality-calibration-v3.1.1'))
t('setup consumes applied calibration',setup.includes('model-calibration.json')&&setup.includes('REC_GENERAL="$CAL_GENERAL"'))
t('root launcher exposes calibrar',launcher.includes('calibrar|calibration'))
t('stable V3.1 platform preserved',manifest.includes("PLATFORM_VERSION='3.1'"))
console.log(`\nRealTalent Agent V3.1.1: ${ok}/9 PASS`);if(ok!==9)process.exit(1)
