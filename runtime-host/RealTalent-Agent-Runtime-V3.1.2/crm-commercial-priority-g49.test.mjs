import test from 'node:test'
import assert from 'node:assert/strict'
import {createCommercialExecutiveG49} from './crm-commercial-priority-g49.mjs'

const post=(id,topic,quote,other={})=>({
  id,topic,url:'https://www.instagram.com/p/SLNT'+String(id).padStart(6,'0')+'/',
  title:'Salento Barbearia',quote,observation:quote,
  evidenceLevel:'snippet',reviewStatus:'analysis_only',
  strategicReading:'O conteúdo pode indicar um foco comercial a investigar.',
  commercialHypothesis:'Verificar se a empresa precisa apoiar este serviço.',
  diagnosticQuestion:'Como vocês organizam este serviço e acompanham seus clientes?',
  ...other,
})
test('G4.9 chooses at most three evidence-backed relevant findings, not all posts',()=>{
  const posts=[
    post(1,'positioning','Aqui é assim! E tem mais @salentobarbearia'),
    post(2,'services','A empresa anuncia prótese capilar e agendamento para clientes no Centro de Rio Grande.'),
    post(3,'promotion','Bem-vindos ao início de nossa história! Inauguração 2024.',{title:'Salento inauguração 2024'}),
    post(4,'services','A barbearia oferece serviços de barba e corte especializados com agendamento.'),
    post(5,'partnership','Parceria de serviços anunciada com equipe local de estética da cidade.'),
    post(6,'positioning','Bom dia'),
  ]
  const result=createCommercialExecutiveG49({
    company:'Salento Barbearia',postAnalyses:posts,
    coverage:{indexed:12,analyzed:6},currentYear:2026,
  })
  assert.equal(result.version,'g49')
  assert.equal(result.status,'findings')
  assert.ok(result.discoveries.length<=3)
  assert.ok(result.discoveries.length>=2)
  assert.ok(result.discoveries.some(x=>x.fact.includes('prótese capilar')))
  assert.ok(result.discoveries.every(x=>x.fact!=='Aqui é assim! E tem mais @salentobarbearia'))
  assert.ok(result.discoveries.every(x=>!x.fact.includes('Inauguração 2024')))
  assert.ok(result.actions.length<=2)
  assert.deepEqual(result.coverage,{indexed:12,analyzed:6,selected:result.discoveries.length})
  assert.match(result.limitations[1],/não interesse em comprar/)
})
test('G4.9 avoids inventing opportunities when content is generic or absent',()=>{
  const result=createCommercialExecutiveG49({
    company:'Salento Barbearia',postAnalyses:[
      post(1,'other','Bem-vindos'),
      post(2,'positioning','Aqui é assim'),
      post(3,'promotion','A nossa inauguração 2024!',{title:'Ano 2024'}),
    ],coverage:{indexed:3,analyzed:3},currentYear:2026,
  })
  assert.equal(result.status,'insufficient_evidence')
  assert.equal(result.discoveries.length,0)
  assert.equal(result.actions.length,0)
  assert.match(result.executive,/Não foram identificados sinais comerciais/)
})
test('G4.9 deduplicates same post and topic while retaining provenance',()=>{
  const a=post(1,'services','Oferecemos prótese capilar com agendamento disponível ao público.')
  const b=post(2,'services','Oferecemos prótese capilar com agendamento disponível ao público.')
  const c=post(3,'services','Novo serviço de prótese capilar e agendamento disponível ao público.')
  const output=createCommercialExecutiveG49({postAnalyses:[a,b,c],currentYear:2026})
  assert.ok(output.discoveries.filter(x=>x.fact===a.quote).length<=1)
  assert.ok(output.discoveries.length<=2)
  assert.equal(output.sourceUrls.length,3)
  assert.ok([a.url,c.url].includes(output.discoveries[0].url))
  assert.equal(output.discoveries[0].reading,'snippet')
})
test('G4.9 does not infer purchase intent, create an approved event or invent a claim',()=>{
  const original=post(9,'services','Prótese capilar - agendamento com horário pela página da empresa.')
  const output=createCommercialExecutiveG49({postAnalyses:[original],coverage:{indexed:1,analyzed:1}})
  const finding=output.discoveries[0]
  assert.ok(finding)
  assert.equal(finding.fact,original.quote)
  assert.equal(finding.priorityMeaning,'Prioridade de investigação, não propensão de compra')
  assert.equal(finding.hypothesis,original.commercialHypothesis)
  assert.equal(Object.hasOwn(finding,'approved'),false)
  assert.equal(Object.hasOwn(output,'pipeline'),false)
})
test('G4.9 rejects unsafe URLs, unreviewed AI output and duplicate sources',()=>{
  const output=createCommercialExecutiveG49({postAnalyses:[
    post(1,'services','Divulgação de serviço de prótese capilar com agendamento.',
      {url:'http://127.0.0.1/admin'}),
    post(2,'hiring','Uma vaga divulgada para atendimento na nova unidade comercial.',
      {reviewStatus:'approved'}),
    post(3,'services','Divulgação de serviço de prótese capilar com agendamento.'),
    post(4,'services','Divulgação de serviço de prótese capilar com agendamento.',
      {url:'https://www.instagram.com/p/SLNT000003/'}),
  ]})
  assert.equal(output.sourceUrls.length,1)
  assert.equal(output.discoveries.length,1)
})
test('G4.9 priority is explicitly not purchase probability even when source is a full page',()=>{
  const output=createCommercialExecutiveG49({postAnalyses:[
    post(4,'services','Prótese capilar com agendamento disponível na barbearia de Rio Grande.',
      {evidenceLevel:'page'}),
  ]})
  assert.equal(output.discoveries[0].priority,'alta')
  assert.match(output.limitations.join(' '),/não interesse em comprar/)
})
