# RealTalent Agent V2.8 — Execution Intelligence & Controlled Autonomy

## Objetivo

A V2.8 conecta o raciocínio da V2.7 à execução real sem introduzir escrita silenciosa. A arquitetura distingue intenção, plano, autorização, dispatch, recibo e verificação. Uma ação só é considerada concluída quando o aplicativo responsável devolve resultado e a pós-condição é verificada.

## Pipeline

```text
pedido
  ↓
Planner / Tool selection
  ↓
Execution Plan
  ├─ risco
  ├─ blast radius
  ├─ idempotency key
  ├─ reversibilidade
  └─ pós-condições
  ↓
Preview
  ↓
Confirmação explícita (se houver escrita)
  ↓
Read: runtime pode executar
Write: dispatch para o aplicativo
  ↓
Receipt do aplicativo
  ↓
Postcondition verification
  ↓
completed / failed / partial
```

## Regras de segurança

- `maxSilentWriteActions = 0`.
- Leitura de baixo risco pode ser automática.
- Escrita externa exige confirmação explícita.
- Alto/crítico também passa pela governança existente.
- Dispatch não é sucesso.
- Cada etapa recebe uma chave de idempotência estável.
- Ações irreversíveis são destacadas antes da confirmação.
- Rollback só é anunciado quando existe estratégia de compensação; caso contrário é apenas um plano/alerta.
- O runtime não finge ter alterado CRM ou Blue Ocean: o domínio executa e devolve recibo.

## Estados relevantes

`planned` → `confirmed` → `executing/dispatched` → `receipt` → `verified/completed`.

Estados de erro/cancelamento permanecem distintos para auditoria.

## Compatibilidade

Preservados:
- V2.2 Grounded App Intelligence;
- V2.3 Intelligence Core;
- V2.4 Memory & Knowledge;
- V2.5 Multimodal Intelligence;
- V2.6 Learning & Evaluation;
- V2.7 Advanced Reasoning & Planning.

## CLI

```bash
./realtalent-agent.sh executar status
./realtalent-agent.sh executar show <plan-id>
./realtalent-agent.sh executar confirm <plan-id>
./realtalent-agent.sh executar run <plan-id>
./realtalent-agent.sh executar verify <plan-id>
./realtalent-agent.sh executar rollback <plan-id>
./realtalent-agent.sh executar cancel <plan-id>
```

`rollback` na CLI atual retorna o preview/estratégia; não executa reversão escondida.
