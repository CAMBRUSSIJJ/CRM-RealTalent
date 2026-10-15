# RealTalent Agent V2.6 — Learning & Evaluation Intelligence

## Objetivo
A V2.6 torna a evolução da Agent mensurável. Em vez de considerar uma versão melhor apenas porque ganhou novas funções ou um benchmark agregado subiu, ela registra falhas reais, transforma expectativas verificáveis em regressões permanentes e bloqueia releases quando um erro conhecido retorna.

## Arquitetura

```text
Chat / Verifier / Feedback do usuário
              │
              ▼
        Failure Memory
              │
     ┌────────┴─────────┐
     │                  │
 erro observado     expectativa objetiva?
     │                  │
     │                  ▼
     │          Regression Dataset
     │                  │
     └──────────┬───────┘
                ▼
       Known-Failure Replay
                │
       ┌────────┴────────┐
       │                 │
 Reliability 1000   Learning Gate
       │                 │
       └────────┬────────┘
                ▼
          Release Gate
```

## Failure Memory
Fontes de falha:
- feedback explícito negativo no chat;
- reparo/falha detectado pelo Response Verifier;
- falhas técnicas registradas por API/CLI.

Falhas equivalentes são deduplicadas por fingerprint. Reincidências aumentam `occurrences` e podem elevar severidade. Uma falha marcada como corrigida pode ser reaberta se reaparecer.

### Privacidade
Pixels e `data_url` de anexos não são persistidos na Failure Memory. Somente metadados necessários para reproduzir o tipo de entrada podem ser guardados.

## Regression Dataset
O dataset combina:
- casos builtin de bugs históricos;
- casos adicionados manualmente;
- falhas promovidas quando existe uma expectativa objetiva verificável.

A Agent não inventa uma resposta ideal para ensinar a si própria. Feedback subjetivo permanece Failure Memory até haver um contrato verificável.

### Casos históricos fixos
A V2.6 já inclui, entre outros:
1. `analise` + imagem deve virar `attachment_analysis`;
2. `Analise o CRM inteiro e priorize o que impede a comercialização` deve acionar Tool-First + Commercial Readiness;
3. mudança de CRM para tema pessoal deve fazer hard context reset;
4. `e esse botão?` pode resolver contra evidência visual estruturada anterior;
5. `analise` sem imagem não pode fingir que existe um anexo.

## Known-Failure Replay
`learning-regression-benchmark.mjs` executa os casos ativos contra os endpoints reais do gateway e salva:
- total / pass / fail;
- hash do dataset;
- versão/runtime/modelos relevantes;
- falhas novas e resolvidas em relação à execução anterior.

## Learning Release Gate
Uma release é bloqueada quando:
- qualquer caso conhecido falha;
- existe falha crítica aberta;
- o dataset mudou depois da última execução;
- o pass rate cai abaixo do baseline aceito explicitamente.

O benchmark clássico de 1.000 pontos continua existindo. A V2.6 exige os dois: score agregado + replay das falhas conhecidas.

## Feedback no chat
Cada resposta da Agent oferece:
- `Útil`;
- `Algo errado`.

Feedback negativo pode registrar motivo e correção sugerida. Ele cria uma falha, mas não cria automaticamente um teste se não houver expectativa verificável.

## CLI

```bash
./realtalent-agent.sh aprender status
./realtalent-agent.sh aprender replay
./realtalent-agent.sh aprender gate
./realtalent-agent.sh aprender failures
./realtalent-agent.sh aprender cases
./realtalent-agent.sh aprender resolve <failure-id> "corrigida e validada"
./realtalent-agent.sh aprender accept
```

## Dados locais
Os arquivos de aprendizagem ficam no estado local da Agent, não no pacote-fonte:

```text
learning/failure-memory.json
learning/regression-dataset.json
learning/feedback.json
learning/latest-regression.json
learning/regression-history.json
learning/accepted-regression-baseline.json
```

## Limites
- A V2.6 não faz fine-tuning automático.
- A V2.6 não considera feedback subjetivo como verdade de treinamento.
- A V2.6 não altera CRM/Blue Ocean silenciosamente para “corrigir” falhas.
- Aceitar baseline é ação explícita.
- Build/typecheck dos produtos continuam gates separados e não são inferidos como PASS quando dependências não estão instaladas.
