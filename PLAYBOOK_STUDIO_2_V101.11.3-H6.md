# Playbook Studio 2.0 — arquitetura funcional

## Modelo

`PlaybookGuidance.conversationGraph` é um grafo versionado (`version: 1`) composto por `nodes` e `edges`.

Cada nó possui identidade, tipo semântico, título, conteúdo, objetivo e posição `x/y`. Cada conexão possui origem, destino e um rótulo que representa a resposta ou condição da conversa.

## Fluxo

```text
Playbook Studio
   ↓
Conversation Graph
   ├─ Mapa visual
   ├─ Estrutura
   ├─ Script gerado
   └─ Simulação
   ↓
PlaybookGuidance
   ↓
Execution Engine / Calling / busca / coaching
```

## Regra de compatibilidade

O grafo é a fonte visual. O CRM continua gerando `content`, `discoveryQuestions`, `objectionPrompts` e `successCriteria` derivados do grafo para que módulos legados e integrações existentes continuem operando.

Nenhuma migration é necessária porque `guidance` já é persistido como JSON no repository local e no Supabase.
