# RealTalent Agent V6.1 — Conversa fluida, no Linux

## Diagnóstico observado na captura
1. Mesmo quando a pessoa pedia um novo roteiro específico, o Agent retornava o fallback fixo da função createCommercialScript contendo placeholders [Nome do cliente], [Sua empresa] etc. Isso parecia um modelo de IA que sempre repete.
2. A UI mostrava Script Studio e estratégia com alto destaque em vez de manter o chat como superfície principal.
3. O chat respondia somente após o Ollama terminar a geração (stream:false).
4. O histórico removia quebras de linha das respostas.

## Mudanças
- Sem fallback genérico: quando o modelo ou refinador falha, o Agent preserva o documento anterior e informa a indisponibilidade; não finge que um roteiro foi personalizado.
- "Abordagem" em perguntas consultivas não ativa o Script Studio; pedidos criativos não são confundidos com escrita no banco.
- Endpoint local /tools/chat-stream encaminha os deltas NDJSON do Qwen3 8B com limites de tamanho, concorrência e tempo. É somente leitura.
- Frontend apresenta texto incremental em balão de conversa, preserva parágrafos e acompanha a rolagem.
- O documento gerado fica num painel recolhível; documentos salvos não invadem a conversa quando o usuário abre o chat.
- O modelo é orientado a considerar o histórico e evitar repetir respostas sem acrescentar algo novo.

## Estado de segurança
- Não expõe Ollama na internet. Loopback: UI 4193, gateway 8796/8797, Ollama 11434, SearXNG 8888.
- CRM read/write mantém permissões e confirmação; streaming é aplicado APENAS à rota conversacional sem execução de ações.
- A rota de pesquisa continua sem streaming e pode demorar mais. RAG e memória entre dispositivos não foram concluídos.
- Não há equivalência entre Qwen3 8B e ChatGPT: a experiência de interface aproxima, mas qualidade/precisão dependem do modelo e das fontes.

## Validação manual após npm ci
- "Quero conversar sobre vendas para jardineiros" -> resposta textual progressiva, sem Script Studio.
- "Crie uma abordagem mais humana para jardineiros" -> conteúdo criativo sem CRM write.
- "Crie um roteiro de ligação para vender jardinagem a condomínios" -> documento recolhível, sem texto genérico se o modelo falhar.
- "Agora deixe mais curto" -> documento ativo versionado e editor; não cria um terceiro roteiro do zero.
- "Pesquise Thiago Reis" -> análise com fontes do motor V6.0, com fontes recolhidas e links.
- Testar Firefox, queda do Ollama, refresh, múltiplos pedidos, exceções e alterações de workspace antes de publicar.
