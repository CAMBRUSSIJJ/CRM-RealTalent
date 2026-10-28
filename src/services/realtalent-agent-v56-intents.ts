/** Explicit external-source requests outrank document revision and CRM scripts. */
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const mutableCrm=/\b(?:crie|criar|envie|enviar|salve|salvar|exclua|excluir|agende|agendar|cadastre|cadastrar|atualize|atualizar)\s+(?:um |uma |o |a )?(?:contato|lead|tarefa|reuniao|proposta|compromisso|oportunidade|playbook|follow.?up)\b/
export function requestsExternalResearch(prompt:string):boolean {
  const value=normalized(prompt)
  if(mutableCrm.test(value))return false
  return /\b(?:pesquise|pesquisar|pesquisa na|procure na|busque na|buscar na|ache na|encontre (?:na internet|fontes)|pesquisa(?:r)? (?:sobre|os|as)|investigue na|fontes (?:na internet|publicas)|consulte (?:sites|a internet)|web|internet)\b/.test(value)
    || (/\b(?:thiago reis|growth machine)\b/.test(value)&&/\b(?:script|roteiro|metodologia|vendas|conteudo|ensinamento|abordagem)\b/.test(value))
}
export function requestsFormatting(prompt:string):'table'|'bullets'|'plain'|null {
  const value=normalized(prompt)
  if(mutableCrm.test(value))return null
  if(/\b(?:em tabela|para tabela|formato de tabela|transforme em tabela|formate como tabela|tabela markdown)\b/.test(value))return 'table'
  if(/\b(?:em topicos|em itens|em lista|com marcadores|lista de pontos|formato de lista)\b/.test(value))return 'bullets'
  if(/\b(?:texto corrido|sem formatacao|remova a formatacao|em paragrafos)\b/.test(value))return 'plain'
  return null
}
export function isExplicitCrmMutation(prompt:string):boolean { return mutableCrm.test(normalized(prompt)) }
