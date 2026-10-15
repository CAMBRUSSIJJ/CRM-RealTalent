import fs from 'node:fs'
const checks=[]
const ok=(name,pass)=>{checks.push([name,Boolean(pass)]);console.log(`${pass?'OK  ':'FAIL'} ${name}`)}
const read=p=>fs.readFileSync(p,'utf8')
const pkg=JSON.parse(read('package.json'))
const gateway=read('scripts/realtalent-communications-gateway.mjs')
const bridge=read('scripts/whatsapp-qr-bridge.mjs')
const panel=read('src/features/settings/whatsapp-integration-panel.tsx')
const client=read('src/services/local-communications-gateway.ts')
const launcher=(read('start-linux.sh') + '\n' + (fs.existsSync('start-linux-legacy.sh') ? read('start-linux-legacy.sh') : '') + '\n' + (fs.existsSync('scripts/start.mjs') ? read('scripts/start.mjs') : '')); const runtimeLauncher=fs.existsSync('scripts/start.mjs')?read('scripts/start.mjs'):''
ok('baseline V101.8.4 preservada',['101.8.4','101.9.0','101.9.1','101.9.2','101.9.3','101.9.4','101.9.5','101.9.6','101.9.7','101.9.8','101.9.9','101.10.0','101.10.1','101.10.2','101.10.3','101.10.4','101.10.5','101.10.6','101.10.7','101.10.8','101.10.9','101.11.0','101.11.1','101.11.2','101.11.3'].includes(pkg.version))
ok('Baileys fixado na release',pkg.dependencies?.['@whiskeysockets/baileys']==='7.0.0-rc14')
ok('gerador QR fixado na release',pkg.dependencies?.qrcode==='1.5.4')
ok('bridge QR usa multi-file auth local',bridge.includes('useMultiFileAuthState')&&bridge.includes('.realtalent-whatsapp-qr'))
ok('bridge gera QR visual',bridge.includes('QRCode.toDataURL'))
ok('bridge recebe mensagens e envia para timeline',bridge.includes("messages.upsert")&&bridge.includes("direction:'inbound'"))
ok('gateway expõe start/status/disconnect do QR',gateway.includes('/api/integrations/whatsapp/qr/start')&&gateway.includes('/api/integrations/whatsapp/qr/status')&&gateway.includes('/api/integrations/whatsapp/qr/disconnect'))
ok('gateway envia por sessão QR',gateway.includes("metadata?.transport==='qr'")&&gateway.includes('whatsappQr.send'))
ok('cliente web possui contrato QR',client.includes('startGatewayWhatsAppQr')&&client.includes('loadGatewayWhatsAppQrStatus'))
ok('tela WhatsApp diferencia QR local e Cloud API',panel.includes('WhatsApp por QR Code')&&panel.includes('WhatsApp Business Platform'))
ok('tela informa modo experimental não oficial',panel.includes('experimental/não oficial'))
ok('launcher instala dependências QR quando ausentes',(launcher.includes("require.resolve('@whiskeysockets/baileys')")&&launcher.includes("require.resolve('qrcode')")&&launcher.includes('npm install --no-audit --no-fund'))||(runtimeLauncher.includes('ensureDependencies')&&runtimeLauncher.includes('npm install')&&pkg.dependencies?.['@whiskeysockets/baileys']&&pkg.dependencies?.qrcode))
const pass=checks.filter(([,v])=>v).length
console.log(`\nV101.8.4-H4 WhatsApp QR Local: ${pass}/${checks.length} contratos aprovados.`)
if(pass!==checks.length)process.exit(1)
