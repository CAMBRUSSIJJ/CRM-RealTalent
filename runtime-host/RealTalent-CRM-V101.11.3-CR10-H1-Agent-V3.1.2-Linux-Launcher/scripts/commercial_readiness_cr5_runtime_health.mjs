import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const targets = [
  ['index.html', 'shell'],
  ['src/app/app.tsx', 'app'],
  ['src/features/pipeline/pipeline-page.tsx', 'pipeline'],
  ['src/features/leads/leads-page.tsx', 'contacts'],
  ['src/features/prospecting/prospecting-page.tsx', 'prospecting'],
  ['src/features/communications/communications-page.tsx', 'communications'],
  ['src/features/proposals/proposals-page.tsx', 'proposals'],
]
const rows = targets.map(([file,label]) => {
  const full=path.join(root,file)
  const exists=fs.existsSync(full)
  return { label, file, exists, bytes: exists ? fs.statSync(full).size : 0 }
})
const dist = path.join(root,'dist')
const distFiles=[]
if (fs.existsSync(dist)) {
  const walk=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).forEach(e=>{ const f=path.join(dir,e.name); e.isDirectory()?walk(f):distFiles.push({file:path.relative(root,f),bytes:fs.statSync(f).size}) })
  walk(dist)
}
const large = distFiles.filter(x=>x.bytes>=250000).sort((a,b)=>b.bytes-a.bytes)
console.log('RealTalent CRM — CR5 Runtime Health')
for (const row of rows) console.log(`${row.exists?'OK':'MISS'} ${row.label.padEnd(15)} ${String(row.bytes).padStart(8)} B  ${row.file}`)
console.log(`dist: ${fs.existsSync(dist)?'present':'not-built'}`)
if (distFiles.length) {
  console.log(`dist files: ${distFiles.length}`)
  console.log(`large assets >=250KB: ${large.length}`)
  large.slice(0,12).forEach(x=>console.log(`  ${String(x.bytes).padStart(9)} B ${x.file}`))
} else console.log('Build payload inspection: BLOCKED until vite build produces dist/')
