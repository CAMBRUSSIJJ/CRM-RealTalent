# Arquitetura V100

## Princípio central

Os componentes React não acessam `localStorage` ou Supabase diretamente. Eles chamam o contrato `CrmRepository`.

```text
Componentes React
      ↓
AppContext / casos de uso
      ↓
CrmRepository
      ↓
LocalCrmRepository ou SupabaseCrmRepository
```

Essa separação permite desenvolver e testar localmente e ativar o banco sem reescrever a interface.

## Domínios

- Autenticação e perfis.
- Organizações/workspaces e membros.
- Leads e Pipeline.
- Atividades e histórico de etapa.
- Ligações e gravações.
- Agenda.
- Metas.
- Automações e execuções.
- Configurações e auditoria.

## Multiempresa

Toda tabela comercial possui `organization_id`. As políticas RLS verificam a associação do usuário em `organization_members`. Os papéis são:

- `owner`: controle integral.
- `admin`: gestão da operação e equipe.
- `member`: uso comercial e gravação de dados.
- `viewer`: leitura.

## Segurança

- A chave publicável fica no frontend.
- A segurança dos registros é feita por RLS.
- Segredos administrativos ficam em Edge Functions ou ambiente de servidor.
- Gravações e anexos são privados e organizados pelo primeiro diretório: `organization_id/...`.

## Próximas etapas

- V100.1: concluída — Leads e Pipeline completos, Realtime e gestão de etapas.
- V100.2: concluída — Follow-ups, Ligações, Agenda, gravações privadas e sincronização do próximo passo.
- V100.3: concluída — Metas, Automações auditáveis, Métricas e runner agendado.
- V100.4: concluída — Playbooks, autenticação de produção, equipes, convites, auditoria, backup, observabilidade e publicação.
