# Changelog V100.21 — Meu Dia, SLA e Base Confiável

## Adicionado

- fila diária inteligente com recomendação e explicação;
- filtros rápidos por SLA, vencimento, proposta, inatividade e ausência de próxima ação;
- parâmetros comerciais configuráveis para primeiro contato, lead parado e proposta parada;
- ações diretas de ligação, WhatsApp, follow-up e edição a partir do Meu Dia;
- revisão e mesclagem segura de possíveis duplicados;
- mesclagem transacional no Supabase com controle de acesso e auditoria;
- diagnóstico operacional local exportável;
- testes unitários e de integração para SLA, priorização e preservação do histórico.

## Alterado

- `Painel` passa a se chamar `Meu Dia`;
- recomendação comercial passa a usar uma regra única e explicável;
- tratamento de duplicados passa de alerta informativo para fluxo resolutivo;
- versão elevada para V100.21.

## Segurança e dados

- mesclagem exige dois leads do mesmo workspace;
- gravações e registros relacionados não são apagados durante a mesclagem;
- diagnósticos são limitados aos 100 eventos mais recentes e ficam no navegador;
- nenhuma integração externa nova foi ativada automaticamente.
