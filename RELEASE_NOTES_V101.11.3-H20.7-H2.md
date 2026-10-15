# RealTalent CRM V101.11.3-H20.7-H2 — WhatsApp Conversation-Only Inbox

Base visual: **V101.11.3-H20.7-H1 — Appearance & Sidebar Truth**  
Linhagem funcional de Comunicação preservada: **V101.11.3-H19.13 — WhatsApp Work Management**.

## Objetivo

Simplificar a coluna esquerda do WhatsApp para funcionar exclusivamente como **navegação de conversas**. Etiquetas, tarefas, follow-ups, status e responsável continuam existindo, porém ficam na conversa aberta, sem ocupar a Inbox.

## Alterado

- removido o bloco **Trabalho** da coluna esquerda;
- removido o bloco **Etiquetas** da coluna esquerda;
- removidos status, etiquetas, follow-up e indicação de tarefa vencida de cada linha de conversa;
- removido o seletor **Ir para contato** e o menu de filtros avançados da Inbox do WhatsApp;
- a busca do WhatsApp passa a usar o texto **Buscar conversas...**;
- ações de criação foram padronizadas em três botões equivalentes: **Contato / Grupo / Contatos**;
- permanecem somente os filtros diretamente ligados à lista: **Todas / Pessoas / Grupos / Não lidas**;
- a lista de conversas ganhou densidade e tipografia alinhadas ao sistema H20.

## Preservado

Na conversa aberta continuam disponíveis:

- Follow-up;
- Tarefa real integrada ao CRM;
- Etiquetas;
- Status operacional;
- Responsável;
- drawer de contexto CRM sob demanda;
- rich media, áudio/voz, reply, grupos e contatos do WhatsApp;
- H19.7 Pure Chat;
- H20.7-H1 Appearance & Sidebar Truth.

## Efeito técnico

A Inbox do WhatsApp deixa de carregar `WorkManagementSnapshot` apenas para construir indicadores laterais. Isso reduz trabalho desnecessário na renderização da lista e mantém a camada operacional no componente `WhatsAppWorkToolbar`.

## QA

- H20.7-H2: **24/24 PASS**
- H19.12: **19/19 PASS**
- H19.13: **27/27 PASS**
- H20.7: **49/49 PASS**
- H20.7-H1: **22/22 PASS**
- Source Syntax: **418 arquivos PASS**
- Integration Contracts: **386 arquivos PASS**
- Migrations: **54/54 PASS**
- Release Manifest: **99/99 PASS**
- Capability Matrix: **43 capacidades / 160 evidências / 105 executáveis**
- CSS Governance: **65/65 PASS**
- Repository Local/Supabase: **100/100 PASS**
- Browser E2E Contract: **11 fluxos PASS**

### Runtime

- WhatsApp Media Delivery Fix: **7/7 PASS**
- WhatsApp Normalization: **8/8 PASS**
- Communications Recovery: **5/5 PASS**
- registry-independent transpile: **303 módulos PASS**

### Gates oficiais dependentes de `node_modules`

O pacote não contém `node_modules`. Neste ambiente:

- `typecheck`: **BLOCKED** — React/tipos ausentes;
- Vitest: **BLOCKED** — `vitest: not found`;
- Vite build: **BLOCKED** — `vite: not found`.

O `dist` produzido pelo builder independente foi auditado, rejeitado por `HTML legado reapareceu` e removido do artefato final.
