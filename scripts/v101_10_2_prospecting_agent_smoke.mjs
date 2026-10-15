import { spawn } from 'node:child_process'
const port=4329
const child=spawn(process.execPath,['scripts/realtalent-prospecting-agent.mjs'],{env:{...process.env,REALTALENT_PROSPECTING_AGENT_PORT:String(port),REALTALENT_PROSPECTING_AGENT_STATE_DIR:`/tmp/realtalent-prospecting-agent-smoke-${process.pid}`},stdio:['ignore','ignore','inherit']})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let ok=false
try{
  for(let i=0;i<30;i++){
    try{const r=await fetch(`http://127.0.0.1:${port}/api/prospecting-agent/health`);const j=await r.json();if(r.ok&&['101.10.2','101.10.2-H1','101.10.2-H2','101.10.2-H3','101.10.3','101.10.3-H1','101.10.3-H4','101.10.3-H5','101.10.3-H6','101.10.3-H8','101.10.3-H9','101.10.4'].includes(j.version)&&j.providers?.openstreetmap&&j.providers?.websiteCrawler){ok=true;break}}catch{}
    await sleep(100)
  }
  if(!ok) throw new Error('health do Prospecting Agent não respondeu corretamente')
  const r=await fetch(`http://127.0.0.1:${port}/api/prospecting-agent/jobs?workspaceId=smoke`); const j=await r.json(); if(!r.ok||!Array.isArray(j.jobs)) throw new Error('listagem de jobs inválida')
  console.log('Prospecting Agent smoke: health + queue API OK')
}finally{child.kill('SIGTERM')}
