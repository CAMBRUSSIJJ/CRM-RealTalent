# RealTalent CRM V100.56.4 — Full QA & Data Consistency

Release corretiva baseada na V100.56.3, com foco em integridade transacional, consistência entre módulos e prevenção de perda silenciosa de dados.

## Correções críticas
- Exclusão individual/em massa de Leads protege negócios ganhos, propostas aceitas/fechadas e receitas ativas; dependências não históricas são limpas de forma coordenada.
- Mesclagem de duplicados preserva e reassocia atividades, ligações, agenda, propostas, oportunidades, receitas e vínculos comerciais.
- Sincronização da estrutura comercial não remove mais empresas/contatos cadastrados manualmente apenas por ainda não terem um Lead associado.
- Corrigida a função Supabase `sync_commercial_structure`: a V100.54 referenciava `v_lead.owner_name`, campo inexistente em `leads`; agora o nome do responsável é resolvido por `profiles`.
- Referências entre workspaces passam por validação no banco para impedir vínculos cruzados entre Lead, etapa, empresa, contato, oportunidade, proposta e receita.
- Exclusão de Lead com histórico comercial passa a ser protegida também no Supabase.

## Consistência de fluxo
- Agenda rejeita datas inválidas e eventos cujo término não seja posterior ao início.
- Etapas não podem ser simultaneamente “Ganha” e “Perdida”; mudanças de etapa sincronizam Lead e oportunidade.
- Envio de proposta sincroniza etapa/status/probabilidade da oportunidade, não apenas do Lead.
- Fechamento de oportunidade exige uma etapa configurada como ganha.
- Numeração local de propostas usa o maior sufixo existente, evitando reutilização após exclusões.
- Propostas validam título, itens, quantidade, preço, desconto, imposto, probabilidade, datas e prazo contratual.
- Receita e metas rejeitam `NaN`, valores inválidos e períodos incoerentes.
- Importação de Leads evita colisões de ID dentro do próprio lote.
- Contatos, relações, atividades, chamadas e eventos reforçam validação de referências e datas.

## Diagnóstico
O serviço de integridade agora detecta, entre outros casos:
- referências órfãs ou cruzadas;
- oportunidades sem Lead/etapa válidos;
- propostas com número duplicado ou versões oficiais conflitantes;
- receita órfã;
- relações entre contatos inválidas;
- automações apontando para etapas inexistentes;
- datas e valores numéricos inconsistentes.

## QA executado neste pacote
- auditoria sintática: 192 arquivos aprovados;
- auditoria de contratos: 163 arquivos aprovados;
- migrations: 35 arquivos com checksum íntegro;
- auditoria de regressão V100.56.4: 21/21 contratos críticos aprovados.

## Limitação do ambiente de empacotamento
`npm test`, `npm run typecheck` e `npm run build` não foram executados porque o ambiente usado para reconstrução não possuía os binários/dependências locais (`vitest`, `tsc` e `vite`) e não havia cache npm disponível para reinstalação. Por isso esta release não é apresentada como “zero bugs”; os gates executáveis sem dependências externas estão incluídos no pacote e aprovados.
