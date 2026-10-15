import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-agent-v07-'))
const config = path.join(root, 'config')
const state = path.join(root, 'state')
fs.mkdirSync(path.join(state, 'realtalent-agent'), { recursive: true })
fs.mkdirSync(path.join(config, 'realtalent-agent'), { recursive: true })
const workflowsFile = path.join(state, 'realtalent-agent', 'workflows.json')
const now = new Date().toISOString()
const seed = {
  version: 1,
  workflows: [
    {
      id: 'wf_checkpoint', version: 1, product: 'crm', title: 'Checkpoint test', objective: 'Criar tarefa segura', summary: 'self-test', status: 'awaiting_approval', currentStepIndex: 0, createdAt: now, updatedAt: now, error: '',
      steps: [{ id: 'step_1', kind: 'act', title: 'Criar tarefa', objective: 'Criar uma tarefa', failure_policy: 'stop', status: 'awaiting_approval', summary: '', outcome: null, jobId: null, action: { tool: 'crm.create_task', lead_id: 'lead_selftest', title: 'Self test', description: 'Teste', due_at: new Date(Date.now()+86400000).toISOString(), priority: 'normal', rationale: 'self-test', risk: 'write' } }],
    },
    {
      id: 'wf_resume', version: 1, product: 'blue_ocean', title: 'Resume test', objective: 'Verificar tela', summary: 'self-test', status: 'needs_user', currentStepIndex: 0, createdAt: now, updatedAt: now, error: 'browser',
      steps: [{ id: 'step_1', kind: 'qa', title: 'QA', objective: 'QA', failure_policy: 'stop', status: 'failed', summary: 'needs user', outcome: 'NEEDS_USER', jobId: 'qa_old', action: null }],
    },
    {
      id: 'wf_cancel', version: 1, product: 'crm', title: 'Cancel test', objective: 'cancelar', summary: 'self-test', status: 'running', currentStepIndex: 0, createdAt: now, updatedAt: now, error: '',
      steps: [{ id: 'step_1', kind: 'analyze', title: 'Analisar', objective: 'Analisar', failure_policy: 'stop', status: 'pending', summary: '', outcome: null, jobId: null, action: null }],
    },
  ],
}
fs.writeFileSync(workflowsFile, JSON.stringify(seed, null, 2), { mode: 0o600 })
const port = 8797
const child = spawn(process.execPath, [new URL('./gateway.mjs', import.meta.url).pathname], {
  env: { ...process.env, XDG_CONFIG_HOME: config, XDG_STATE_HOME: state, REALTALENT_AGENT_PORT: String(port), REALTALENT_AGENT_HOST: '127.0.0.1', OPENAI_API_KEY: '', REALTALENT_AI_PROVIDER:'openai' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d)
const base=`http://127.0.0.1:${port}`
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(base+'/health');if(r.ok)return}catch{}await sleep(50)}throw new Error('gateway não iniciou\n'+logs)}
async function json(url,opt={}){const r=await fetch(base+url,{headers:{'content-type':'application/json'},...opt});const x=await r.json().catch(()=>({}));return {r,x}}
let ok=0, total=0
const check=(label,pass)=>{total++; console.log(`${pass?'OK  ':'FAIL'} ${label}`); if(pass)ok++}
try{
  await wait()
  let z=await json('/health'); check('health V1.6', z.r.ok && z.x.version==='3.1' && z.x.autonomousWorkflows?.enabled===true)
  z=await json('/workflows'); check('lista workflows persistidos', z.r.ok && z.x.workflows?.length===3)
  z=await json('/workflows/wf_checkpoint/approve',{method:'POST',body:'{}'}); check('checkpoint business exige execução local', z.r.ok && z.x.execution_required===true && z.x.workflow?.status==='awaiting_execution')
  z=await json('/workflows/wf_checkpoint/steps/step_1/complete',{method:'POST',body:JSON.stringify({success:true,summary:'executado localmente'})}); check('etapa externa completa workflow', z.r.ok && z.x.workflow?.status==='completed' && z.x.workflow?.progress?.percent===100)
  z=await json('/workflows/wf_resume/resume',{method:'POST',body:'{}'}); check('resume NEEDS_USER reseta QA', z.r.ok && z.x.workflow?.status==='running' && z.x.workflow?.currentStep?.jobId===null && z.x.workflow?.currentStep?.status==='pending')
  z=await json('/workflows/wf_cancel/cancel',{method:'POST',body:'{}'}); check('cancelamento workflow', z.r.ok && z.x.workflow?.status==='cancelled')
  z=await json('/control/state'); check('Control Center expõe workflows', z.r.ok && Array.isArray(z.x.workflows?.recent) && z.x.workflows.recent.length===3)
  z=await json('/workflows/run',{method:'POST',body:JSON.stringify({product:'crm',objective:'teste sem chave',context:{},allowed_tools:[]})}); check('planner falha fechado sem API key', z.r.status===503 && /OpenAI API/.test(z.x.error||''))
  const mode=fs.statSync(workflowsFile).mode & 0o777; check('workflow store chmod 600', mode===0o600)
} finally { child.kill('SIGTERM'); await sleep(80); fs.rmSync(root,{recursive:true,force:true}) }
console.log(`\nWorkflow regression self-test V1.6: ${ok}/${total} aprovados.`)
if(ok!==total) process.exit(1)
