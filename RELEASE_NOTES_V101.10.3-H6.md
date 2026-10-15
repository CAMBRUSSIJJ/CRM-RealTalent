# RealTalent CRM V101.10.3-H6 — Progressive Processing

A H6 remove o gargalo em que o usuário precisava esperar a campanha inteira terminar para começar a revisar empresas. Agora cada `CompanyCandidate` que termina o processamento com qualidade suficiente é publicado incrementalmente para a **Revisão**, enquanto o Territory Engine continua pesquisando as demais células e o Enrichment Pipeline continua processando outras empresas.

## Entregue

- **Revisão progressiva durante a campanha:** candidatos `ready` aparecem no CRM antes de o job terminar.
- Cada publicação recebe um cursor monotônico `reviewRevision` e timestamp `reviewPublishedAt`.
- Endpoint incremental `GET /api/prospecting-agent/jobs/:id/review?afterRevision=N` retorna somente revisões novas.
- ACK explícito `POST /api/prospecting-agent/jobs/:id/review/ack` confirma somente depois do upsert local no CRM.
- O ACK é persistente e não usa `clientImportedAt`; portanto confirmar uma revisão parcial não encerra/importa artificialmente o job inteiro.
- O fechamento terminal filtra candidatos já confirmados e importa somente pendências, reduzindo reprocessamento e duplicação.
- Reprocessamento isolado do H5 republica o candidato quando novos dados deixam a empresa pronta ou atualizam uma empresa já pronta.
- O painel **Processamento** mostra quantas empresas já estão **Na revisão ao vivo**.
- A primeira sincronização progressiva apresenta um aviso único no CRM, sem gerar uma entrada de histórico a cada polling.
- `reviewStream` é persistido no Agent com `revision`, `acknowledgedRevision`, `readyCandidates`, `lastPublishedAt` e `lastAcknowledgedAt`.
- Schema local do Agent evoluído para v4 com normalização de jobs anteriores.
- Launcher agora migra o estado do Garimpo a partir de V101.10.3-H5/H4/H1/base antes de procurar versões V101.10.2.

## Comportamento operacional

O fluxo passa a ser:

```text
Territory Search
      ↓
CompanyCandidate
      ↓
Enrichment Jobs
      ↓
qualityStatus = ready
      ↓
reviewRevision +1
      ↓
Revisão no CRM
      ↓
ACK

(enquanto outras células continuam pesquisando)
```

Empresas com `attention` continuam preservadas e entram no fechamento da campanha, evitando ocultar casos incompletos que precisam de revisão humana.

## Preservado

A H6 preserva Territory Search H1, Coverage Truth H2, Identity Resolver 2.0 H3, Canonical Company Bridge H4 e Independent Enrichment Jobs H5.

## QA

Passaram: auditoria sintática em 385 arquivos, 358 contratos de integração, 49/49 migrations, Release Manifest 40/40, Repository Local/Supabase 98/98, V101.10.3 41/41, H1 44/44, H2 10/10, H3 10/10, H4 13/13, H5 28/28 e H6 28/28. A regressão legada terminou com 3.185 linhas `OK` e 0 `FAIL`.

O smoke H6 provou o requisito temporal: a empresa foi entregue por `/review` enquanto o job ainda estava `running`, o ACK persistiu o cursor e a mesma revisão não foi reentregue antes do fechamento.

Os gates globais `typecheck`, Vitest e Vite build foram tentados, mas esta árvore de montagem não contém `node_modules`. O launcher Linux continua instalando dependências e executando `release:verify` antes de abrir o CRM; esses gates não são declarados aprovados neste ambiente.
