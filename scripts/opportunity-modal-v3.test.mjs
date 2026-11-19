import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'

const read = (path) => fs.readFileSync(path, 'utf8')
const form = read('src/features/leads/lead-form.tsx')
const modal = read('src/features/leads/create-lead-modal.tsx')
const pipeline = read('src/features/pipeline/pipeline-page.tsx')
const css = read('src/features/leads/opportunity-create-v3.css')

test('Nova oportunidade V3: JSX sintaticamente íntegro', () => {
  for (const [name, text] of [['LeadForm', form], ['CreateLeadModal', modal], ['PipelinePage', pipeline]]) {
    const parsed = ts.createSourceFile(name+'.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    assert.equal(parsed.parseDiagnostics.length, 0, name+' contém erro sintático')
  }
})
test('Nova oportunidade (formato B): coluna única sem abas e sem componente estático duplicado', () => {
  assert.ok(!form.includes("['essencial', 'Essencial']"), 'As abas foram substituídas pelo formato B')
  assert.ok(form.includes("if (mode === 'opportunity' && !lead) {"), 'Novo formulário não isolado')
  assert.ok(form.includes('className="opportunity-create-b"'))
  assert.ok(form.includes('opportunity-create-b__toggle'), 'Mais detalhes recolhível ausente')
  assert.ok(form.includes('className={`form-grid lead-form'), 'Formulário de contato original não preservado')
  assert.ok(!modal.includes('NewOpportunityModal'), 'Não usar protótipo estático')
})
test('Nova oportunidade (formato B): entradas essenciais ligadas ao estado real', () => {
  for (const field of ['name', 'company', 'phone', 'email', 'stageId', 'value', 'expectedCloseAt', 'nextActionAt', 'ownerId', 'priority']) {
    assert.ok(form.includes("update('"+field+"'"), 'Campo sem vínculo de dados: '+field)
  }
  assert.ok(form.includes('snapshot?.stages ?? []'), 'Etapas devem vir da base real')
  assert.ok(form.includes('snapshot?.companies.map'), 'Empresas precisam vir do CRM')
  assert.ok(form.includes('if (emailInvalid) setExpanded(true); return'), 'E-mail inválido precisa abrir Mais detalhes')
  assert.ok(form.includes('toLocalInput(value.nextActionAt)'), 'Próxima ação deve aparecer no horário local')
  assert.ok(form.includes('possibleDuplicate'), 'Detecção de duplicidade deve permanecer')
  assert.ok(form.includes('companyMatch'), 'Reuso de empresas deve permanecer')
})
test('Nova oportunidade: Mais detalhes preserva informação comercial', () => {
  for(const field of ['cnpj','website','postalCode','street','addressNumber','complement','district','city','state','country','jobTitle','decisionRole','temperature','source','influenceLevel','consentStatus','doNotContact','doNotContactReason','sourceDetail','sourceUrl','capturedAt','notes','tags']) {
    assert.ok(form.includes("update('"+field+"'"), 'Campo não conectado: '+field)
  }
  assert.ok(form.includes('buildLeadAddress(normalized)'), 'Geocodificação preservada')
  assert.ok(form.includes('addressStatusForLead(normalized)'), 'Estado do endereço preservado')
  assert.ok(form.includes('consentStatus'), 'Política de contato preservada')
})
test('Nova oportunidade V3: opções de salvar executam ações no Pipeline real', () => {
  for(const field of ["intentRef.current = 'open'", "intentRef.current = 'close'", "intentRef.current = 'call'", "intentRef.current = 'followup'", "intentRef.current = 'another'"]) {
    assert.ok(modal.includes(field), 'Ação de salvar ausente: '+field)
  }
  assert.ok(modal.includes('onCreated?.(lead, action)'))
  assert.ok(pipeline.includes('onCreated={(lead, action) => {'), 'Callback do Pipeline não conectado')
  assert.ok(pipeline.includes("if (action === 'open') setViewing(lead)"))
  assert.ok(pipeline.includes("if (action === 'call')"))
  assert.ok(pipeline.includes('openPipelineCall(lead)'))
  assert.ok(pipeline.includes("if (action === 'followup') openActivity(lead, 'followup')"))
  assert.ok(modal.includes("if (action === 'another')"), 'Reiniciar para nova oportunidade')
})
test('Nova oportunidade V3: folha de estilo dedicada sem seletores globais destrutivos', () => {
  assert.ok(modal.includes("import './opportunity-create-v3.css'"))
  assert.ok(css.includes('.opportunity-create-v3__tabs'))
  assert.ok(css.includes('.opportunity-create-v3__grid'))
  assert.ok(css.includes('.modal:has(.opportunity-create-v3)'))
  assert.ok(!/\n\s*(body\s*\{|html\s*\{|:root\s*\{)/.test(css), 'CSS global fora do escopo')
  let braces=0
  for(const char of css) { if(char === '{') braces++; if(char === '}') braces--; assert.ok(braces>=0) }
  assert.equal(braces,0)
})
