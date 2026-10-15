# RealTalent CRM + Agent V2.2 — Grounded App Intelligence

O CRM sincroniza a tela ativa com o runtime pelo App Context Bridge. Quando o drawer do Agent está aberto, o runtime recebe workspace, rota, lead/proposta selecionado e um snapshot compacto dos dados relevantes.

## Contrato principal
- `POST /app-context/sync`
- produto: `crm`
- rota atual e IDs selecionados
- dados de contatos/leads/pipeline/atividades/propostas/metas
- Tool-First imposto no servidor para consultas do produto real
- ferramentas de escrita nativas permanecem `requires_confirmation`

## Validação sem dependências
`node scripts/realtalent_agent_v22_grounded_app_intelligence_audit.mjs`

Typecheck/build completos exigem `node_modules` e continuam sendo um gate separado; este pacote não declara esses gates como PASS sem execução real.
