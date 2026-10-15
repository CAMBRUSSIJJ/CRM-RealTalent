# RealTalent CRM V101.11.3-H22.1 — Team Profiles & Real Access Control

Base: V101.11.3-H21.1-H1 — Communication Lineage Guard Fix  
Data: 2026-10-12

## Objetivo

Transformar Equipes em uma superfície real de controle de acesso. A H22.1 deixa de tratar cargo/perfil apenas como informação visual e introduz um permission engine central com perfis, ações, escopo de registros, bloqueio de rotas e proteção RLS no Supabase.

## Perfis padrão

- Administrador
- Gestor
- Vendedor
- SDR
- Somente leitura

Perfis padrão são imutáveis. Para personalizar, o usuário duplica um perfil e cria uma variante própria.

## Matriz de acesso

Recursos:
- Contatos
- Pipeline
- Tarefas
- Comunicações
- Propostas
- Garimpo
- Metas
- Configurações

Ações modeladas:
- Ver
- Criar
- Editar
- Excluir
- Exportar
- Atribuir

Escopos:
- Sem acesso
- Somente próprios
- Minha equipe
- Todo o workspace

## Enforcement completo nesta etapa

### Contatos
- visibilidade own/team/all;
- criação, edição, exclusão e exportação independentes;
- bulk delete valida registro por registro;
- merge valida edição do principal e exclusão do duplicado;
- importação valida ownership de cada registro;
- troca de responsável exige a ação `Atribuir`.

### Pipeline
- visibilidade own/team/all;
- criação, edição e exclusão independentes;
- drag/movimentação e bulk operations respeitam o escopo;
- troca de responsável exige `Atribuir`.

### Tarefas
- lista filtrada por own/team/all;
- criar/editar/excluir protegidos no service;
- mudança de responsável ou equipe exige `Atribuir`;
- criação delegada para outra pessoa/equipe exige `Atribuir`.

## Backend / Supabase

Migration nova:

`202610120001_v101_11_3_h22_1_team_profiles_access_control.sql`

Cria:
- `access_profiles`;
- `member_access_profiles`;
- helpers SQL para ação e escopo;
- RLS para administração dos perfis;
- RLS de ownership em Contacts/legacy Leads/Tasks;
- trigger de assignment para separar `Editar` de `Atribuir` no banco.

O trigger impede que um perfil que pode editar, mas não atribuir, troque owner/assignee por chamada direta ao backend.

## Navegação e rota

O recurso `Ver` controla:
- item da sidebar;
- navegação móvel;
- acesso direto à rota.

Tentar abrir uma rota sem permissão mostra `Acesso restrito` em vez de renderizar a feature.

## Equipes → Perfis e acesso

Nova aba administrativa com:
- lista de perfis;
- criação e duplicação de perfil customizado;
- matriz de permissões;
- atribuição de perfil por membro;
- `Visualizar como` para prévia de quantos Contatos, oportunidades de Pipeline e Tarefas o membro consegue ver.

Owner/Admin continuam Administrador efetivo como proteção administrativa de emergência.

## Verdade de enforcement na UI

A matriz diferencia explicitamente:
- `Registros`: Contatos, Pipeline e Tarefas — ações + own/team/all realmente aplicados nesta release;
- `Módulo`: demais recursos — `Ver` já bloqueia navegação/rota; enforcement granular das demais ações será propagado em releases H22 seguintes.

Isso evita prometer proteção que ainda não foi implementada.

## Limite do modo Local

Modo Local não é uma fronteira de segurança entre pessoas: todos os dados vivem no mesmo navegador/dispositivo e não existe autenticação individual multiusuário.

No modo Local:
- engine de permissão funciona para a identidade local ativa;
- `Visualizar como` permite validar o escopo de outros membros;
- não há isolamento seguro contra quem controla o dispositivo/devtools.

Para segurança multiusuário real, usar modo Supabase com login individual; nesse modo, a mesma política é aplicada no banco por RLS.

## Limitação arquitetural conhecida

`leads` ainda é o backing legado compartilhado de Contatos + Pipeline. Enquanto essas superfícies dividirem a mesma tabela, a RLS de `leads` aceita a autorização equivalente de Contatos **ou** Pipeline. As páginas continuam aplicando o recurso correto, mas separação absoluta de backend entre os dois recursos depende de eliminar esse backing compartilhado em uma evolução futura.

## Preservado

- H21.1 Garimpo Coverage & Runtime Truth;
- H21.1-H1 Communication Lineage Guard;
- H20.7-H2 WhatsApp Conversation-Only Inbox;
- Pure Chat;
- RealTalent Connect / One-Tap;
- 55 migrations verificadas após a nova migration;
- repository parity Local/Supabase.

## Validação

- `qa:architecture`: PASS
- H22.1: **54/54 PASS**
- Team Access runtime: **17/17 PASS**
- Source Syntax: **420 arquivos PASS**
- Integration Contracts: **388 arquivos PASS**
- Migrations: **55/55 PASS**
- Release Manifest: **103/103 PASS**
- CSS Governance: **65/65 PASS**
- Linux preflight: **381 TS/TSX PASS**
- Capability Matrix: **45 capacidades / 168 evidências / 111 executáveis**
- Repository Local: **100/100 PASS**
- Repository Supabase: **100/100 PASS**
- Browser E2E Contract: **11 fluxos**
- Registry-independent transpile: **305 módulos PASS**

## Gates oficiais dependentes de dependências

O ambiente de build não conseguiu concluir `npm ci` e `node_modules` permaneceu ausente.

- typecheck: BLOCKED — primeiro erro raiz `Cannot find module 'react'`;
- Vitest: BLOCKED — `vitest: not found`;
- Vite build: `validate:env` PASS, build BLOCKED — `vite: not found`.

O registry-independent build gerou `dist` apenas para auditoria. O bundle audit rejeitou esse fallback por `HTML legado reapareceu`; o diretório `dist` foi removido do artefato final.
