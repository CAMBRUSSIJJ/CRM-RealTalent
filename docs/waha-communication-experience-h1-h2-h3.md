# RealTalent V101.11.3 — Comunicação WAHA H1/H2/H3 (prévia)

> Esta versão é uma **prévia local** no Linux e não deve ser publicada em Production sem validação com sessão WAHA real. O WAHA Docker permanece conectado; nenhum envio é feito automaticamente pela IA.

## Funcionalidades

1. **Confiabilidade (H1)**: novas mensagens pelo stream local WAHA, polling de recuperação (20 s), busca nas mensagens atualmente carregadas, rascunho isolado por conversa, status de ACK não inventado, botão para ver mensagens recentes sem mover o scroll quando se está lendo histórico.
2. **IA de áudio (H2)**: transcrição individual de cada áudio **recebido**, a pedido do usuário, no próprio chat. Endpoint `POST /v1/ai/transcribe` aceita apenas `chatId` + `messageId`, lê a mensagem do WAHA, usa Whisper CPU/int8 local, não realiza envios, não aceita URLs de mídia informadas pelo navegador. O histórico da IA comercial já combina texto e voz em evidências.
3. **Painel contextual (H2)**: painel comercial integrado à página, três colunas quando houver largura, sobreposição responsiva no restante. Respostas continuam sempre como rascunhos para revisão.
4. **Handoff comercial (H3, primeiro passo)**: botão em cada próximo passo sugerido pela IA prepara um rascunho na aba Tarefas. O texto é transferido por sessionStorage, expira em dez minutos e é consumido uma única vez. Só a ação manual **Criar tarefa** persiste dados. Links para Contatos, Pipeline, Follow-ups e Agenda não criam ou editam registros.

## Executar

1. Feche somente o terminal anterior do CRM `127.0.0.1:5174` e, se existir, a ponte antiga `127.0.0.1:4392`. **Não desligue o Docker WAHA.**
2. No Linux Debian, a partir da pasta do repositório, execute `bash deploy/waha-direct/instalar-e-abrir-ia-audios-linux.sh`.
3. Abra `http://127.0.0.1:5174/#/communications`. Copie a chave local da ponte em `127.0.0.1:4392` se necessário. Não publique essa chave.
4. Se o transcritor não estiver instalado, o script realiza o download inicial de `faster-whisper` e do modelo local. Na execução, o reconhecimento roda offline, na CPU.

## Testes manuais obrigatórios antes da publicação

- Verificar mídia recebida antiga e nova: imagem, documento, vídeo e áudio. Se a mídia antiga não foi armazenada no WAHA, poderá continuar indisponível.
- Em grupo, validar se as mensagens mostram nomes individuais (e fallback quando WAHA só fornece ID).
- Alternar entre duas conversas com rascunhos diferentes: o texto e o anexo não podem ir para o destinatário errado.
- Receber mensagem e verificar que aparece por evento WAHA sem recarregar manualmente; se stream cair, recuperação por polling.
- Confirmar que `Pendente`, `Entregue`, `Lida` são mostrados apenas quando há status de ACK retornado pelo WAHA.
- Transcrever um áudio real recebido e conferir o texto; se falhar, usar `node deploy/waha-direct/diagnosticar-midias-linux.mjs` sem compartilhar mensagens/segredos.
- Rodar análise comercial, escolher um próximo passo e clicar **Preparar tarefa no CRM**. Conferir título e descrição no modal, cancelar e confirmar que nenhuma tarefa foi criada. Repetir e usar **Criar tarefa** manualmente.
- Não confundir sugestões comerciais de IA com fatos: conferir evidências M01, M02 etc.

## Limites atuais

- Busca no chat consulta apenas mensagens carregadas, não todo o histórico remoto.
- Ligação automática de contatos, criação de oportunidades/propostas e automação de mensagens ainda **não implementadas** no H3.
- Transcrição individual exige que o WAHA disponibilize o áudio e que o Whisper esteja instalado.
- Testes automatizados usam WAHA/Ollama simulados; ainda faltam as verificações humanas descritas acima.

## QA

`node --test deploy/waha-direct/server.test.mjs deploy/waha-direct/tools.test.mjs deploy/waha-direct/conversation-intelligence.test.mjs deploy/waha-direct/audio-transcription.test.mjs deploy/waha-direct/group-senders.test.mjs deploy/waha-direct/inline-voice.test.mjs`

`npm exec -- vitest run src/services/waha-task-handoff.test.ts`

`npm run typecheck && npm run build`
