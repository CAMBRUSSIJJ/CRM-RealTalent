# RealTalent Agent Runtime V2.9 — Long-Horizon Autonomous Workflows

Runtime local-first compartilhado por RealTalent CRM e Blue Ocean Service Studio.

A V2.9 preserva todo o núcleo V2.2–V2.8 e adiciona execução longa persistente: DAG de dependências, checkpoints, heartbeat/lease, recuperação após interrupção, pausa/retomada e orçamento de autonomia.

## Início rápido

```bash
chmod +x *.sh
./setup-agent-linux.sh
./start-agent-linux.sh
```

Interface: `http://127.0.0.1:8791/chat`  
Control Center: `http://127.0.0.1:8791/control`

## Execution Intelligence

```bash
./execution-agent-linux.sh status
./execution-agent-linux.sh show <plan-id>
./execution-agent-linux.sh confirm <plan-id>
./execution-agent-linux.sh run <plan-id>
./execution-agent-linux.sh verify <plan-id>
./execution-agent-linux.sh rollback <plan-id>
```

O protocolo V2.8 separa explicitamente: `planned` → `confirmed` → `dispatched/executing` → `receipt` → `verified/completed`. Planejar ou despachar uma escrita nunca equivale a afirmar que a alteração ocorreu.

## Política de segurança

- leituras de baixo risco podem ser executadas automaticamente;
- `maxSilentWriteActions = 0`;
- toda escrita externa exige confirmação explícita;
- ações de alto/critico risco passam também pela governança;
- cada etapa carrega `idempotencyKey`, risco e blast radius;
- operações irreversíveis são marcadas antes da confirmação;
- CRM/Blue Ocean executam a mutação no próprio domínio e devolvem recibo;
- a Agent verifica pós-condições antes de marcar o plano como concluído;
- rollback é apenas planejado quando não existe reversão tecnicamente garantida.

## Advanced Reasoning preservado

```bash
./reasoning-agent-linux.sh status
./reasoning-agent-linux.sh plan "compare três arquiteturas e decida a melhor"
```

A V2.8 não persiste nem expõe cadeia de pensamento. Mantém apenas artefatos operacionais seguros, como objetivo, critérios, plano, evidências, riscos, checkpoints e recibos.

## Princípios

- `Tool-First` continua soberano quando existe fonte real.
- Hipótese nunca é promovida a fato sem evidência.
- `unknown`/ausência de evidência nunca vira PASS.
- Uma escrita não vira sucesso antes de recibo + pós-condição.
- Ações irreversíveis são explicitamente destacadas.
- RAG, memória semântica, Vision, Failure Memory e Advanced Reasoning continuam seletivos.

## Long-Horizon V2.9

```bash
./autonomy-agent-linux.sh status
```

Escritas continuam proibidas sem checkpoint/confirmacão. Lease expirado gera `recovery_required`, não retry cego.
