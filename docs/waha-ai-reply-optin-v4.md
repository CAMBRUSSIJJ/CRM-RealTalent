# RealTalent — Respostas da IA no WhatsApp (PR #71)

## Resposta com revisão (padrão)

Em Comunicação > WAHA GOWS local > IA local, selecione uma conversa, clique em **Responder com IA**. A resposta gerada pelo Ollama/Qwen aparecerá na lateral. Você pode:

- **Inserir no campo para revisar**: editar no compositor e enviar manualmente.
- **Confirmar e enviar pelo WhatsApp**: exibe confirmação com o texto e o destinatário. Ao confirmar, chama o envio autenticado do WAHA uma única vez, sem retry automático de resultado incerto.

## Respostas automáticas por contato (opt-in)

No mesmo painel, há **Ativar para este contato**, disponível somente para conversas privadas. O botão informa explicitamente que haverá envio real sem revisão individual. Requer confirmação no navegador.

**Desativado por padrão e desativado novamente quando a ponte local é reiniciada.** A configuração de automação não é persistida. O controle fica somente na memória do processo Linux, autenticado com a chave da ponte. Em grupo não é oferecido.

### Regras de operação

1. Usa apenas eventos novos `message` do WAHA (GOWS); `message.any`, confirmações e mensagens do próprio número não geram respostas automáticas.
2. Exige mensagem recente (até 2 min), identificador válido e conversa individual explicitamente habilitada.
3. Aguarda brevemente e confirma se a mensagem recebida é a última do histórico antes de gerar e imediatamente antes de enviar. Se um atendente respondeu, outra mensagem chegou ou o usuário desabilitou a opção, aborta.
4. Qwen local gera resposta em PT-BR restrita a informações verificáveis do histórico; o envio inclui assinatura **— Assistente virtual RealTalent**.
5. Pode transcrever mensagem de voz recebida via Whisper local, somente quando a mídia estiver disponível. Outros tipos de mídia não disparam resposta.
6. **Máximo de 3 tentativas de resposta por hora por contato**, 10 por hora no conjunto, intervalo mínimo de 2 minutos. Deduplicação por ID de mensagem; falha/timeout não gera retry.
7. Palavras explícitas de parada (`pare`, `parar`, `stop`, etc.) desativam o modo para aquela conversa.
8. A análise textual pode errar. Mensagens com preços, links, pagamento, dados sensíveis ou promessas detectadas são bloqueadas. Não usar para assumir valores, prazos, descontos ou compromissos.

## Testes no Linux

1. Encerre apenas as prévias anteriores do CRM e da ponte nas portas 5174 e 4392. **Não desligue o Docker WAHA**.
2. Execute `bash deploy/waha-direct/instalar-e-abrir-ia-audios-linux.sh` dentro do projeto.
3. Acesse `http://127.0.0.1:5174/#/communications`. A ponte está em `http://127.0.0.1:4392/`.
4. Teste primeiro **com seu próprio número** ou uma conversa de teste autorizada. Gere sugestão, confira e envie com confirmação.
5. Ative o modo automático nessa conversa de teste; envie uma nova pergunta por outra conta. Verifique a resposta assinada e se o limite funciona.
6. Desative o modo e confirme que mensagens novas não recebem respostas automáticas. Reinicie a ponte e confirme que tudo voltou a ficar desligado.
7. Teste a palavra `pare`. Depois, verifique que um grupo não oferece a opção.

## Limites e segurança

- **Não foi publicado em Production**. É uma prévia local dependente do WAHA e do Ollama/Whisper no Linux.
- Não há envio em lote, follow-up automático, criação de tarefas sem revisão ou mudança automática do Pipeline.
- Nenhuma mensagem histórica dispara o modo automático no início da ponte.
- Controle de envio é por chat, não por etiqueta. A ponte nunca persiste a ativação automática.
- Para produção, validar número de teste, mídia real, opt-out, reconexões e adequação às políticas e aos consentimentos de atendimento pelo WhatsApp.

## QA

`node --test deploy/waha-direct/auto-reply.test.mjs deploy/waha-direct/server.test.mjs deploy/waha-direct/conversation-intelligence.test.mjs`

`npm run typecheck && npm run build`
