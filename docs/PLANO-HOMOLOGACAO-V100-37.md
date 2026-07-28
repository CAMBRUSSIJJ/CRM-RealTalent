# Plano de homologação — V100.37

## Escopo congelado

Durante a homologação não entram novas abas, módulos ou alterações amplas de layout. São aceitos apenas correções, ajustes de integração, segurança, persistência e acessibilidade.

## Ordem de aprovação

1. Autenticação, organização e troca de workspace.
2. Leads e qualidade dos dados.
3. Motor Comercial Unificado.
4. Pipeline.
5. Ligações e Modo Ligação.
6. Follow-up e cadências.
7. Agenda e Meu Dia.
8. Automações e webhooks.
9. Lead Score.
10. Métricas e metas.
11. Mapa Comercial e geocodificação.
12. Garimpo e Playbooks.
13. Configurações, permissões e exportações.

## Critérios por módulo

Cada módulo precisa passar por interface, funcionalidade, integração, persistência, permissão, falha controlada e responsividade.

## Cenários obrigatórios

- Atualizar a página após criar ou editar um registro.
- Repetir uma ação para comprovar idempotência.
- Simular perda de conexão e falha do Supabase.
- Usar usuários de organizações diferentes.
- Testar administrador, gestor, vendedor e visualizador.
- Confirmar que uma ligação/reunião atualiza histórico, próxima ação, Pipeline, Follow-up, Agenda, Meu Dia e métricas sem duplicar.

## Evidências

A release somente pode ser aprovada com:

- `HOMOLOGATION-REPORT-V100-37.json` aprovado;
- `DATABASE-AUDIT-V100-37.json` aprovado;
- `PRE-FLIGHT-V100-37.json` aprovado;
- `RELEASE-MANIFEST-V100-37.json` gerado;
- aceite funcional no ambiente de homologação.
