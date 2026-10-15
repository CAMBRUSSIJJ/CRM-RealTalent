# RealTalent Agent V1.6 — Conversation Intelligence

## Objetivo
Corrigir o principal gargalo observado na V1.5: qualidade de conversa e uso indevido de contexto, mantendo toda a infraestrutura de Project Awareness, Builder, Browser QA, Workflow, Mission, Program e Governance.

## Adicionado
- Intent Router antes de Project Awareness;
- Context Relevance Gate;
- Topic Shift Detection;
- Perspective Guard;
- General Chat Mode;
- Follow-up Detection;
- Response Quality Layer;
- endpoint `POST /conversation-intelligence/classify`;
- metadata conversacional persistida por turno;
- resposta determinística curta para saudações/agradecimentos comuns;
- `replace` no streaming quando o pós-processamento reduz repetição.

## Corrigido
- `oi` depois de uma conversa sobre CRM não herda mais o tópico CRM;
- `como posso me amar?` trata `me` como referência ao usuário;
- perguntas conceituais não ativam Project Awareness desnecessariamente;
- pedidos de implementação/código continuam ativando Project Awareness;
- no modo automático, execução só começa quando a intenção é operacional;
- controles do composer agora diferenciam `Contexto automático` de `IA decide`.

## Preservado
- Ollama local-first, sem necessidade de OpenAI API;
- Project Awareness / Code Graph / Root Cause;
- Builder Sandbox e rollback;
- Browser QA;
- Workflows, Missões e Programas;
- Governance e aprovações;
- `/chat` como interface principal e `/control` como modo técnico.
