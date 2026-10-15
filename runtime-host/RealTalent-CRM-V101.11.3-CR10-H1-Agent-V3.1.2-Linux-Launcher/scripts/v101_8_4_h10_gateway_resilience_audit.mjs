#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const exists=p=>fs.existsSync(path.join(root,p))
const checks=[]
const ok=(name,cond)=>checks.push([name,Boolean(cond)])
const launcher=((read('start-linux.sh') + '\n' + (fs.existsSync('start-linux-legacy.sh') ? read('start-linux-legacy.sh') : '') + '\n' + (fs.existsSync('scripts/start.mjs') ? read('scripts/start.mjs') : '')) + '\n' + (exists?.('start-linux-legacy.sh') ? read('start-linux-legacy.sh') : '') + '\n' + (exists?.('scripts/start.mjs') ? read('scripts/start.mjs') : ''))
const gateway=read('scripts/realtalent-communications-gateway.mjs')
const supervisor=read('scripts/realtalent-communications-supervisor.mjs')
const bridge=read('scripts/whatsapp-browser-qr-bridge.mjs')
const client=read('src/services/local-communications-gateway.ts')
const index=read('index.html')

ok('supervisor dedicado existe',exists('scripts/realtalent-communications-supervisor.mjs'))
ok('launcher usa supervisor do gateway',launcher.includes('realtalent-communications-supervisor.mjs')&&!launcher.includes('node scripts/realtalent-communications-gateway.mjs >"$COMM_LOG"'))
ok('launcher espera health real por até 15s',launcher.includes('seq 1 30')&&launcher.includes('sleep 0.5')&&launcher.includes("j.version!=='101.8.4-h10'"))
ok('launcher migra sessão H9 para H10',launcher.includes('RealTalent-CRM-V101.8.4-H9-Communications-Reliability')&&launcher.includes('Migrando para H10'))
ok('supervisor reinicia processo que cai',supervisor.includes('reiniciando em')&&supervisor.includes('setTimeout(launch, delay)'))
ok('supervisor encaminha sinais ao filho',supervisor.includes("child.kill('SIGTERM')")&&supervisor.includes("process.on('SIGTERM'"))
ok('supervisor permite smoke com entry isolado',supervisor.includes('REALTALENT_COMMUNICATIONS_GATEWAY_ENTRY'))
ok('gateway publica versão H10',gateway.includes("const VERSION = '101.8.4-h10'"))
ok('gateway trata promises e exceções fatais com log',gateway.includes("process.on('unhandledRejection'")&&gateway.includes("process.on('uncaughtException'"))
ok('background sync não deixa rejection escapar',gateway.includes('runBackgroundSync().catch')&&gateway.includes('sincronização em segundo plano falhou'))
ok('gateway encerra WhatsApp Web graciosamente',gateway.includes('whatsappQr.shutdown?.()')&&gateway.includes("process.on('SIGTERM'"))
ok('bridge protege eventos message/message_create',bridge.includes("recordLiveMessage(message, 'live_inbound').catch")&&bridge.includes("Falha ao registrar mensagem criada"))
ok('bridge protege ack e ready',bridge.includes('Falha ao atualizar confirmação da mensagem')&&bridge.includes('Falha ao finalizar conexão WhatsApp'))
ok('bridge expõe shutdown de sessões',bridge.includes('async function shutdown()')&&bridge.includes('Promise.allSettled')&&/return\s*\{[\s\S]*?\bshutdown\b[\s\S]*?\}/.test(bridge))
ok('frontend faz retry seguro em GET',client.includes("const attempts = method === 'GET' ? 3 : 1")&&client.includes('await wait(250 * attempt)'))
ok('mensagem de indisponibilidade não acusa launcher falsamente',client.includes('indisponível ou reiniciando')&&!client.includes('Inicie o CRM pelo ./start-linux.sh.'))
ok('index identifica H10',index.includes('V101.8.4-H10 — Communications Gateway Resilience'))
ok('release notes H10 existem',exists('RELEASE_NOTES_V101.8.4-H10.md'))

for(const [name,pass] of checks) console.log(`${pass?'OK  ':'FAIL'} ${name}`)
const failed=checks.filter(([,pass])=>!pass)
console.log(`\nV101.8.4-H10 Communications Gateway Resilience: ${checks.length-failed.length}/${checks.length} contratos aprovados.`)
if(failed.length){console.log('Falharam: '+failed.map(([name])=>name).join('; '));process.exit(1)}
