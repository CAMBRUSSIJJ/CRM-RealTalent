# RealTalent Agent V1.4 — Conversational Workbench

## Adicionado
- streaming nativo do Ollama para respostas conversacionais no endpoint `POST /chat/conversations/:id/messages/stream`;
- eventos NDJSON de `delta`, `status`, `assistant`, `done` e `error`;
- memória contextual por conversa (`conversation.memory`) com objetivos recentes, anexos e histórico de trabalhos;
- modo explícito `Trabalhe nisso`, além de `Automático` e `Só responder`;
- captura de tela no composer usando permissão nativa do navegador;
- progresso operacional inline com eventos recentes do Builder/Browser QA;
- rota restrita de evidência de QA para capturas Antes/Depois;
- comparação Antes × Depois dentro do chat quando o Browser QA produz screenshots;
- self-test dedicado `conversational-workbench-selftest.mjs`.

## Melhorado
- o Context Engine passa a receber memória resumida da conversa em vez de depender apenas das últimas mensagens;
- a interface diária esconde Program/Mission/Workflow/Task e mostra linguagem de trabalho normal;
- o modo técnico continua disponível em `/control`;
- CRM e Blue Ocean abrem `/chat` como experiência principal e exibem o branding V1.4 Conversational Workbench.

## Segurança
- streaming conversacional não executa ferramentas nem afirma alterações que não aconteceram;
- pedidos operacionais continuam passando pelo roteador, Governança, checkpoints, Builder sandbox e QA;
- evidências de imagem são servidas somente a partir do diretório local de QA e por IDs de job validados;
- anexos continuam limitados e o binário bruto não é persistido no histórico público da conversa.

## Limitações
- streaming nativo é implementado para Ollama; providers não locais podem usar resposta bufferizada;
- sem `OLLAMA_VISION_MODEL`, imagens podem ser anexadas, mas a IA não deve alegar análise visual do conteúdo;
- a comparação Antes × Depois depende de um Browser QA que tenha produzido ao menos uma captura;
- os launchers não incluem `node_modules`; portanto build/typecheck completos dos produtos dependem das dependências locais do usuário.
