import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const page = fs.readFileSync('src/features/communications/communications-page.tsx','utf8')
const css = fs.readFileSync('src/features/communications/communications-central-v3.css','utf8')
const whatsApp = fs.readFileSync('src/features/communications/whatsapp-chat-panel.tsx','utf8')
const email = fs.readFileSync('src/features/communications/email-conversation-panel.tsx','utf8')
const actions = fs.readFileSync('src/features/communications/whatsapp-work-toolbar.tsx','utf8')

test('Central V3: o JSX real continua válido e a nova folha é carregada', () => {
  const parsed=ts.createSourceFile('communications-page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  assert.equal(parsed.parseDiagnostics.length,0,parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))
  assert.ok(page.includes("import './communications-central-v3.css'"))
})
test('Central V3: somente uma estrutura de layout é renderizada', () => {
  for(const key of ['communications-central-v3__header','communications-central-v3__shell','communications-central-v3__inbox','communications-central-v3__thread','communications-central-v3__conversation-list','communications-central-v3__search']) {
    assert.ok(page.includes(key),'Componente novo ausente: '+key)
  }
  for(const old of ['communications-v10094 communication-focus-experience','panel omnichannel-hero communication-focus-header','className="omnichannel-shell"','className="panel omnichannel-conversations','panel omnichannel-thread','communication-focus-inbox__views','communication-focus-inbox__tools','communication-channel-workspace-header']) {
    assert.ok(!page.includes(old),'Layout antigo duplicado: '+old)
  }
  assert.equal((page.match(/<aside className="communications-central-v3__inbox"/g)||[]).length,1)
  assert.equal((page.match(/className="communications-central-v3__shell"/g)||[]).length,1)
  assert.ok(!page.includes('Leo Martins'), 'Referência fictícia não pode ser inserida no CRM')
  assert.ok(!page.includes('Diamond Barbearia'), 'Referência fictícia não pode ser inserida no CRM')
})
test('Central V3: conversas e estado de conexão usam fontes reais', () => {
  for(const key of ['buildCommunicationConversations(timeline)','mergeCommunicationTimeline(localTimeline, official, assisted)','loadOfficialCommunicationTimeline(','syncOfficialCommunications(','loadCommunicationChannelState(','visibleConversations.map((conversation)','conversation.unreadCount','channelState?.emailAccounts.length','connectedWhatsAppCount','whatsappConnectionText']) {
    assert.ok(page.includes(key),'Informação real ausente: '+key)
  }
  assert.ok(page.includes('onClick={() => void syncNow()}'),'Ação Sincronizar não conectada')
  for(const tab of ["setInboxView('all')","setInboxView('people')","setInboxView('groups')","setInboxView('unread')","setInboxView('needs_reply')"])assert.ok(page.includes(tab),tab)
})
test('Central V3: envio, e-mail, anexos, WhatsApp e gerenciamento comercial preservados', () => {
  for(const key of ['<WhatsAppChatPanel','<WhatsAppWorkToolbar','<EmailConversationPanel','<OfficialConversationComposer','<WhatsAppContactsModal','<WhatsAppNewContactModal','<WhatsAppCreateGroupModal','<WhatsAppContactLinkModal','<SalesMessageModal','<SocialTouchModal','<MeetingQuickModal','onSent={() => { void reloadOfficial(true) }}','canTeamAccessRecord']) {
    assert.ok(page.includes(key),'Integração perdida: '+key)
  }
  for(const key of ["sendOfficialWhatsApp(","onClick={() => fileInputRef.current?.click()}","chooseFile(","startRecording()","<WhatsAppConnectionCenter"])assert.ok(whatsApp.includes(key),'WhatsApp alterado ou ação ausente: '+key)
  assert.ok(email.includes('sendOfficialEmail('))
  for(const key of ['saveTask(','followupOpen','labelsOpen','chooseStatus(','taskOpen'])assert.ok(actions.includes(key),'Ferramenta da conversa ausente: '+key)
})
test('Central V3: CSS não modifica sidebar global nem outras abas', () => {
  for(const key of ['.communications-central-v3__header','.communications-central-v3__shell','.communications-central-v3__thread > .whatsapp-chat','.communications-central-v3__thread > .email-workspace-panel','@media(max-width:800px)','html[data-theme="dark"] .communications-central-v3'])assert.ok(css.includes(key),key)
  assert.ok(!/(^|\n)\s*(body\s*\{|html\s*\{|:root\s*\{|\*\s*\{)/m.test(css))
  assert.ok(!css.includes('.app-sidebar{'))
  let braces=0
  for(const char of css){braces+=char==='{'?1:char==='}'?-1:0;assert.ok(braces>=0)}
  assert.equal(braces,0)
})

test('Central V3: histórico completo visível ao conectar QR e aviso antigo limpo após recuperação', () => {
  assert.ok(page.includes("useState<'7' | '30' | '90' | 'all'>('all')"), 'WhatsApp não deve ocultar conversas por filtro implícito de 30 dias')
  assert.ok(page.includes("const clearCommunicationFilters = () => { setDirection('all'); setPeriod('all') }"))
  assert.ok(page.includes("allValue: 'all', allLabel: 'Todo histórico'"))
  assert.ok(page.includes('setChannelState(state); setOfficialError(\'\')'), 'Aviso de erro antigo deve desaparecer quando a recuperação funcionar')
})
