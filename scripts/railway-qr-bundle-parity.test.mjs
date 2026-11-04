import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = 'scripts'
const hosted = 'runtime-host/RealTalent-CRM-V101.11.3-CR10-H1-Agent-V3.1.2-Linux-Launcher/scripts'
const parityFiles = [
  'whatsapp-browser-qr-bridge.mjs',
  'whatsapp-lid-addressing.mjs',
  'whatsapp-web-send-result-hotfix.mjs',
]

test('QR hospedado: o navegador WhatsApp no Railway usa as mesmas correções testadas localmente', () => {
  for (const filename of parityFiles) {
    const expected = fs.readFileSync(path.join(root, filename), 'utf8')
    const actual = fs.readFileSync(path.join(hosted, filename), 'utf8')
    assert.equal(actual, expected, `Arquivo de runtime desatualizado: ${filename}`)
  }
})

test('QR hospedado: todas as dependências relativas do bridge estão presentes no pacote Railway', () => {
  const source = fs.readFileSync(path.join(hosted, parityFiles[0]), 'utf8')
  const imports = [...source.matchAll(/from ['"](\.\/[^'"]+)['"]/g)].map((match) => match[1])
  assert.ok(imports.length > 3, 'Dependências do navegador não encontradas')
  for (const importPath of imports) {
    assert.ok(fs.existsSync(path.resolve(hosted, importPath)), `Módulo ausente no Railway: ${importPath}`)
  }
})

test('QR hospedado: a inicialização é idempotente, preserva o erro real e limita reconexões', () => {
  const source = fs.readFileSync(path.join(hosted, parityFiles[0]), 'utf8')
  assert.match(source, /const pendingStarts\s*=\s*new Map\(\)/)
  assert.match(source, /reconnectAttempts\s*>\s*5/)
  assert.match(source, /const previousError\s*=/)
  assert.match(source, /console\.warn\(\`\[WhatsApp QR\]/)
  assert.match(source, /client\.initialize\(\)\.catch\(error/)
  assert.match(source, /applyWhatsAppWebSendResultHotfix/)
})

test('CRM ↔ Railway: endpoint de revisão em tempo real existe no gateway hospedado', () => {
  const source = fs.readFileSync(path.join(hosted, 'realtalent-communications-gateway.mjs'), 'utf8')
  assert.ok(source.includes("u.pathname==='/api/communications/revision'"))
  assert.ok(source.includes('workspaceCommunicationsRevision(s.events,workspaceId)'))
})
