# RealTalent CRM V101.9.4 — Global Event Bus

## Escopo

A V101.9.4 consolida as mudanças de domínio em um barramento único sem redesenhar a UX principal. Mutações locais, Supabase Realtime e o SSE da Central de Comunicação passam a produzir `DomainEvent` e a mesma infraestrutura decide quais partes do `WorkspaceSnapshot` e quais superfícies operacionais precisam reagir.

## Entregue

- `DomainEvent` tipado com workspace, source, entidade, correlação, revisão e payload;
- `GlobalDomainEventBus` com subscribe, deduplicação, histórico limitado e `BroadcastChannel` entre abas;
- `EventRefreshCoordinator` para coalescer eventos e atualizar somente os slices afetados;
- mapa de projeções para Pipeline, Follow-ups, Meu Dia, Comunicação, Notificações e Métricas;
- bridge compartilhada de Supabase Realtime → Domain Event Bus;
- bridge compartilhada de Communications SSE → Domain Event Bus;
- estado de transporte realtime compartilhado;
- Central de Comunicação deixa de abrir SSE próprio e reage à projeção `communications`;
- mutações centrais de Contato/Lead/Pipeline/Atividade/Ligação/Agenda/Propostas/Buyer Room/Receita/Metas/Automações publicam eventos de domínio;
- inspector `window.__REALTALENT_EVENTS__.inspect()`;
- nenhuma migration SQL nova: as 47 migrations da V101.9.3 permanecem intactas.

## Fluxo

```text
Mutações locais ─┐
Supabase Realtime ├─> DomainEventBus
Communications SSE┘        │
                           ├─> Projection revisions
                           ├─> EventRefreshCoordinator
                           │      └─> Snapshot slices
                           └─> BroadcastChannel entre abas

Projeções:
Pipeline · Follow-ups · Meu Dia · Comunicação · Notificações · Métricas
```

## Compatibilidade

- `WorkspaceSnapshot` continua sendo a interface consumida pela UI;
- `Lead` continua como projection comercial legada da V101.9.3;
- nenhum módulo visual é removido;
- Connect One-Tap e Communications Gateway permanecem preservados;
- o release channel técnico `official-communications` permanece por compatibilidade dos gates históricos.

## Próxima etapa

V101.9.5 — Workflow Runtime 3.0: scheduler, delay/wait, branch, retries, idempotency e inspector de execuções persistidas.

## QA

- Global Event Bus: **30/30** contratos;
- Linux preflight: **312 TS/TSX**;
- sintaxe: **346 arquivos**;
- contratos de integração: **314 arquivos**;
- migrations: **47/47**;
- typecheck isolado do núcleo do Event Bus: **OK**;
- runtime smoke: **OK**;
- regressão histórica até o typecheck: **3.004 OK / 0 FAIL**;
- `AppContext`: **69.429 bytes**, mantendo o gate histórico abaixo de 70 KB.

O `npm install` da montagem expirou por rede e não criou `node_modules`; por isso `typecheck + Vitest + build` globais permanecem como gates do `start-linux.sh` no Linux.
