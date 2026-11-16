# RealTalent CRM — Copiloto Gemini supervisionado para WhatsApp

## Escopo entregue
- O chat existente permanece o único responsável pelo envio de mensagens, independentemente de seu transporte WAHA ou QR.
- No chat individual, **Sugerir resposta** e **Analisar conversa** consultam o Gemini após consentimento explícito no próprio painel.
- Respostas são inseridas no editor para revisão, mas **nunca enviadas automaticamente**.
- Somente até 15 mensagens textuais recentes (650 caracteres por mensagem) são transmitidas ao Google após confirmação. Mídias e tokens não são enviados.
- O backend é o Communications Gateway já existente, autenticado pelo proxy da Vercel e com a checagem de pertencimento ao workspace.
- Sem criar novo QR nem segunda sessão WAHA, sem n8n, sem alterar histórico, contatos ou pipeline automaticamente.

## Configuração obrigatória no servidor
No serviço do Communications Gateway (Railway ou Linux, conforme o ambiente usado), configure a variável secreta:
  GEMINI_API_KEY=<sua chave nova do Google AI Studio>
Opcionalmente:
  GEMINI_MODEL=gemini-3.5-flash-lite
Não use \`VITE_GEMINI_API_KEY\`, não configure no navegador e não envie a chave para o GitHub.
Reinicie **apenas** o Communications Gateway após salvar o segredo.
A função permanece desativada sem a variável; os recursos WhatsApp existentes não são alterados.

## Validação
1. Execute \`node --test scripts/communications-gemini-copilot.test.mjs\`.
2. Abra Comunicações > WhatsApp no CRM com uma conversa individual autorizada.
3. Marque a caixa de consentimento e clique em **Analisar conversa**.
4. Confira resumo, possíveis necessidades e próximos passos, sem ações automáticas.
5. Clique em **Sugerir resposta** e revise o texto inserido no editor. Apenas o botão Enviar existente efetua envio.
6. Verifique que grupo, contato bloqueado e conversa sem mensagens não acionam a IA.
7. Teste HTTP 503 / 429 da Gemini API: o chat e a fila WAHA devem permanecer intactos.

## Limites conhecidos
- Gemini funciona na nuvem, mas o WAHA/gateway hospedado localmente requer notebook ligado. Operação 24h depende de migrar os serviços para infraestrutura persistente.
- O provedor escolhido foi gemini-3.5-flash-lite, confirmado pelo usuário em 16/11/2026; disponibilidade e preço devem ser conferidos no projeto Google AI Studio.
- Não é mecanismo de disparo em massa nem um agente SDR autônomo.
- A transferência de conversa ao Google depende da modalidade e das condições de dados da Gemini API. Avaliar LGPD, contrato e consentimento antes do uso com clientes reais.
