# RealTalent CRM V101.11.3-H22.2 — Cross-Module Access Control

Base: **V101.11.3-H22.1 — Team Profiles & Real Access Control**.

## Objetivo

Propagar o modelo real de perfis, ações e escopo da H22.1 para **Comunicações/WhatsApp, Propostas, Garimpo e Metas**, mantendo a mesma regra de segurança usada em Contatos, Pipeline e Tarefas.

A H22.2 não trata permissão como simples visibilidade de botão. Em modo Supabase, o acesso é protegido também por **RLS e triggers de banco**, inclusive nos caminhos de escrita que passam por funções `SECURITY DEFINER`.

## Modelo de acesso

Cada recurso continua usando duas dimensões independentes:

- ações: `view`, `create`, `edit`, `delete`, `export`, `assign`;
- escopo: `none`, `own`, `team`, `all`.

A matriz em **Equipes → Perfis e acesso** agora classifica como recursos com enforcement por registro:

- Contatos;
- Pipeline;
- Tarefas;
- Comunicações;
- Propostas;
- Garimpo;
- Metas.

Configurações continua como recurso administrativo em nível de módulo.

## Comunicações / WhatsApp

- A Inbox é filtrada de acordo com a carteira permitida ao usuário.
- Conversas vinculadas a um contato usam o responsável do contato como referência de escopo.
- O work-state do WhatsApp pode fornecer ownership para conversas ainda não vinculadas.
- `Criar` governa nova conversa/novo contato/novo grupo.
- `Editar` governa resposta, composer e alterações operacionais da conversa.
- `Atribuir` governa troca de responsável.
- WhatsApp, E-mail e composer oficial recebem estado `readOnly` quando o perfil não pode editar o registro.
- Responder uma conversa existente pode ser permitido por `Editar` sem obrigar o perfil personalizado a possuir `Criar`.

Pure Chat e a Inbox conversation-only H20.7-H2 permanecem preservados.

## Propostas, catálogo, receita e Buyer Rooms

- A lista de propostas é filtrada por `proposal.ownerId` ou pelo owner do contato relacionado.
- Criar, editar, excluir e exportar são permissões independentes.
- Trocar owner de uma proposta exige `assign`.
- O seletor de contato na criação/edição não oferece registros fora do escopo permitido.
- Revenue Entries herdam owner da receita, proposta ou contato.
- Buyer Rooms herdam o escopo da proposta/contato relacionado.
- Catálogo é tratado como dado do módulo de Propostas, com ações de criação/edição/exclusão protegidas.
- As ações centrais no `AppContext` executam `assertTeamAccess` antes da escrita.

## Garimpo

- `ProspectRecord` passa a preservar `createdBy`.
- O modo Supabase persiste `created_by` e o modo local preserva compatibilidade com registros antigos.
- A listagem aplica `own/team/all` usando o autor do registro.
- Criar, editar, excluir, exportar e atribuir são permissões separadas.
- Sem `assign`, o envio ao CRM restringe o owner ao próprio usuário.
- Workspaces operacionais entram em `readOnly` sem permissão de edição.
- A H21.1 de Coverage & Runtime Truth continua preservada.

## Metas

- Metas de pessoa usam `userId` para escopo.
- Metas de equipe usam `teamId`.
- Metas de workspace exigem escopo `all` no banco.
- Criar, editar, excluir e atribuir são protegidos separadamente.
- Mudar usuário, equipe ou scope de uma meta exige `assign`.

## Supabase / segurança de dados

Nova migration:

`202610120002_v101_11_3_h22_2_cross_module_access_control.sql`

A migration adiciona:

- `rt_communication_owner(...)` com validação de membership da organização;
- `rt_cross_module_guard()`;
- RLS de escopo para Comunicação, Propostas, Garimpo e Metas;
- triggers `BEFORE INSERT/UPDATE/DELETE` nos caminhos protegidos;
- proteção de writes executados por funções `SECURITY DEFINER`;
- guard de `assign` para mudança de owner em Propostas;
- guard de `assign` para mudança de pessoa/equipe/scope em Metas;
- remoção explícita da policy permissiva histórica `prospecting_events_write`.

## Limite do modo Local

O modo Local continua útil para configurar e testar perfis, mas **não oferece isolamento multiusuário real**, porque todos os dados vivem na mesma sessão/navegador.

Para segurança real por pessoa é necessário:

- login individual;
- modo Supabase;
- RLS aplicada no banco.

## Validação

- `qa:architecture`: PASS.
- H22.1: **54/54 PASS**.
- H22.2: **75/75 PASS**.
- H22.1 runtime: **17/17 PASS**.
- H22.2 runtime: **25/25 PASS**.
- Source Syntax: **420 arquivos PASS**.
- Integration Contracts: **388 arquivos PASS**.
- Migrations: **56/56 checksum íntegro**.
- Release Manifest: **105/105**.
- Capability Matrix: **46 capacidades / 175 evidências / 117 executáveis**.
- Repository Local: **100/100**.
- Repository Supabase: **100/100**.
- Browser E2E contracts: **11 fluxos**.
- CSS Governance: **65/65**.
- Linux preflight: **381 TS/TSX PASS**.
- Registry-independent transpile: **305 módulos PASS**.

## Gates oficiais dependentes de dependências

`npm ci` não concluiu na janela deste ambiente e não produziu `node_modules`. Portanto:

- typecheck oficial: **BLOCKED** — React/Supabase/tipos ausentes;
- Vitest: **BLOCKED** — `vitest: not found`;
- Vite build: `validate:env` PASS, build **BLOCKED** — `vite: not found`.

O build registry-independent produz apenas um `dist` de auditoria; o bundle audit o recusou corretamente por `HTML legado reapareceu`. Esse `dist` foi removido do artefato final.

## Marker de runtime

A URL do launcher inclui:

`rt_access2=101.11.3-h22-2-cross-module-access-control`
