# V101.11.2 — Teams & Tasks Architecture

## Objetivo

Adicionar gestão operacional de **Equipes** e **Tarefas** ao RealTalent CRM sem acoplar o novo domínio ao repositório monolítico existente e sem alterar Pipeline, Contatos, Calling ou Comunicações.

## Navegação

Novas rotas de primeiro nível:

- `#/tasks` — Tarefas
- `#/teams` — Equipes

As preferências da sidebar usam schema v2. Workspaces existentes recebem as duas novas rotas sem perder a configuração anterior.

## Modelo de dados

### Equipes

- `Team`
- `TeamMembership`

### Tarefas

- `WorkTask`
- `TaskRelation`
- `TaskChecklistItem`
- `TaskComment`

Uma tarefa pode se relacionar a:

- Contato
- Empresa
- Oportunidade
- Registro comercial
- Pipeline / etapa
- Playbook
- Reunião

## Persistência

### Modo local

`src/services/work-management.ts` usa armazenamento workspace-scoped via `safeStorage`:

`realtalent:<workspaceId>:work-management:v1`

### Supabase

A migration `202610060001_v101_11_2_teams_tasks_foundation.sql` cria seis tabelas:

- `teams`
- `team_members`
- `work_tasks`
- `task_relations`
- `task_checklist_items`
- `task_comments`

Todos os IDs de entidades criadas pelo frontend em modo Supabase usam UUID puro. IDs prefixados continuam restritos ao modo local.

## Segurança / RLS

Leitura exige membership na organização.

Escrita de Equipes e Team Members exige `is_organization_admin`.

Escrita operacional de tarefas, relações, checklist e comentários usa `can_write_organization`.

## Tarefas — UX V101.11.2

Visualizações:

- Lista
- Quadro
- Hoje
- Atrasadas
- Concluídas

Filtros:

- busca textual
- responsável
- equipe
- prioridade

Campos disponíveis na criação/edição:

- título
- descrição
- status
- prioridade
- responsável
- equipe
- prazo
- tags
- relação com CRM
- checklist

Status:

- A fazer
- Em andamento
- Bloqueada
- Concluída
- Cancelada

Prioridades:

- Baixa
- Normal
- Alta
- Urgente

## Equipes — UX V101.11.2

Cada equipe possui:

- nome
- descrição
- cor
- líder
- membros
- tarefas abertas
- tarefas atrasadas
- histórico de concluídas
- carga de trabalho por pessoa

A carga usa um indicador operacional derivado de quantidade, prioridade e atraso das tarefas abertas. Nesta versão ela é uma métrica de capacidade do CRM, não uma folha de horas.

## Integridade de escrita

- `created_by` é definido na criação da tarefa e não é sobrescrito em edições posteriores.
- `completed_at` é preservado quando uma tarefa já concluída é editada.
- Substituição de membros, relações e checklist valida erros de exclusão antes de inserir o novo estado.
- Exclusão de equipe mantém tarefas e remove apenas o vínculo com a equipe (`ON DELETE SET NULL` no Supabase; comportamento equivalente no modo local).

## QA registrado

Capability Matrix:

- `workspace.tasks`
- `workspace.teams`

Fluxos críticos:

- `tasks-open` → `#/tasks`
- `teams-open` → `#/teams`

## Limitações deliberadas

A V101.11.2 é a fundação operacional. Ainda não inclui:

- conversa/comentários na interface da tarefa;
- anexos;
- scheduler automático de recorrência;
- tarefas embutidas diretamente na ficha de Contato/Account 360;
- Tarefas dentro do Meu Dia;
- criação de tarefa por Automações;
- alertas do Attention Engine baseados em tarefas atrasadas;
- capacity planning baseado em horas ou calendário real.

Essas integrações devem evoluir sobre este modelo, sem criar um segundo sistema de tarefas.
