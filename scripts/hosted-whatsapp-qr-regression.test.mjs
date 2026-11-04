import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const settings = fs.readFileSync('src/features/settings/whatsapp-integration-panel.tsx', 'utf8')
const center = fs.readFileSync('src/features/communications/whatsapp-connection-center.tsx', 'utf8')
const proxy = fs.readFileSync('api/runtime/_proxy.mjs', 'utf8')

test('WhatsApp hospedado: QR Code não está mais condicionado ao modo local', () => {
  assert.ok(settings.includes('<strong>WhatsApp por QR Code</strong>'))
  assert.ok(!settings.includes('{localGatewayMode ? <section className="whatsapp-setting-card-h198"'))
  assert.ok(settings.indexOf('<strong>WhatsApp por QR Code</strong>') < settings.indexOf('<strong>WhatsApp Cloud API</strong>'))
  assert.ok(settings.includes('Verificar gateway'))
  assert.ok(settings.includes('Gerar QR Code'))
})

test('WhatsApp hospedado: status real do gateway é consultado antes de habilitar o QR', () => {
  assert.ok(settings.includes('const gatewayReady = whatsappGatewayIsHealthy(gatewayHealth,runtimeStatus)'))
  assert.ok(!settings.includes('const gatewayReady = !localGatewayMode'))
  const runtimeHealth = settings.slice(settings.indexOf('const refreshRuntimeState ='), settings.indexOf('const recoverGateway ='))
  const readyCheck = settings.slice(settings.indexOf('const ensureGatewayReady ='), settings.indexOf('const refreshDiagnostics ='))
  assert.ok(!runtimeHealth.includes('if (!localGatewayMode) return true'))
  assert.ok(!readyCheck.includes('if (!localGatewayMode) return true'))
  assert.ok(settings.includes('await loadCommunicationsGatewayHealth()'))
  assert.ok(settings.includes('await loadGatewayWhatsAppQrStatus(workspaceId)'))
  assert.ok(settings.includes('await ensureGatewayReady()'))
  assert.ok(settings.includes('disabled={!gatewayReady'))
})

test('WhatsApp hospedado: pareamento usa gateway existente e não fabrica QR', () => {
  assert.ok(settings.includes('startGatewayWhatsAppQr(workspaceId'))
  assert.ok(settings.includes('qrStatus?.qrDataUrl ? <img src={qrStatus.qrDataUrl}'))
  assert.ok(settings.includes('const next = await loadGatewayWhatsAppQrStatus(workspaceId)'))
  assert.ok(settings.includes('window.setInterval(() => void tick(), 1500)'))
  assert.ok(settings.includes('setShowQr(false)'))
  assert.ok(settings.includes('disconnectGatewayWhatsAppQr(workspaceId)'))
})

test('Central de Comunicação: painel QR também é acionável no modo hospedado', () => {
  assert.ok(center.includes('<strong>WhatsApp por QR Code</strong>'))
  assert.ok(center.includes('const health = await loadCommunicationsGatewayHealth()'))
  assert.ok(center.includes('setQrAvailable(true)'))
  assert.ok(center.includes('setQrAvailable(false)'))
  assert.ok(center.includes('startGatewayWhatsAppQr(workspaceId'))
  assert.ok(center.includes('qrStatus?.qrDataUrl && qrStatus.state'))
  assert.ok(!center.includes('const localGateway = effectiveDataMode'))
  assert.ok(center.includes('Verificar gateway'))
})

test('QR hospedado: Vercel exige organização e permissão de pareamento', () => {
  assert.ok(proxy.includes("'/rest/v1/organization_members?'"))
  assert.ok(proxy.includes("row?.role === 'owner' || row?.role === 'admin'"))
  assert.ok(proxy.includes('workspace_admin_required'))
  assert.ok(proxy.includes('workspace_permission_check_unavailable'))
  assert.ok(proxy.includes('isQrPairingRoute(service, suffix)'))
})

test('TSX WhatsApp: ambas as interfaces são sintaticamente válidas', () => {
  for (const [name, body] of [['whatsapp-integration-panel.tsx',settings], ['whatsapp-connection-center.tsx', center]]) {
    const parsed = ts.createSourceFile(name,body,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
    assert.equal(parsed.parseDiagnostics.length,0, parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '))
  }
})
