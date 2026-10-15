# RealTalent Agent V2.7 — Advanced Reasoning & Planning

## Objetivo
Melhorar a qualidade do raciocínio sem depender de aumentar indiscriminadamente o tamanho do modelo e sem expor cadeia de pensamento.

## Pipeline
`Input → Context/RAG → Planner → Executor → Critic → Finalizer`

Em tarefas profundas o Planner produz apenas artefatos operacionais: enquadramento do problema, premissas não confirmadas, dados desconhecidos, rótulos de hipóteses/alternativas, evidências necessárias, etapas verificáveis e critérios de sucesso. O Executor recebe esse plano junto do contexto recuperado. O Critic compara a resposta contra o pedido, políticas, evidências e critérios. O Finalizer aceita, usa o reparo do Critic ou autoriza **um único replanejamento** quando existe lacuna material.

## Modos
- **direct**: saudações/perguntas simples.
- **planner-executor-critic-finalizer**: análise profunda, diagnóstico, comparação, decisão, planejamento, auditoria e Tool-First.

## Hipóteses concorrentes
Diagnósticos podem manter até 4 hipóteses; comparação/decisão, até 3. Cada hipótese guarda somente `label` + `evidence_needed`. Não é armazenado raciocínio interno.

## Checkpoints
1. Frame do problema.
2. Evidências necessárias.
3. Hipóteses/alternativas.
4. Cobertura/contradições.
5. Conclusão proporcional às evidências.
6. Verificação final.

## Replanejamento
Máximo: 1. Só ocorre por lacuna material, contradição ou conclusão sem suporte. Isso evita loops deliberativos e consumo excessivo.

## Segurança cognitiva
- cadeia de pensamento: não persistida e não exposta;
- hipóteses != fatos;
- ausência de evidência != PASS;
- tool output atual > memória antiga;
- Critic não autoriza mutação de negócio.
