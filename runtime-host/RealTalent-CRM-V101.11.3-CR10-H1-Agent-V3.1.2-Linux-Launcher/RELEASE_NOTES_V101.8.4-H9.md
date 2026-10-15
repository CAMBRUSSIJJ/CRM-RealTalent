# RealTalent CRM V101.8.4-H9 — Communications Reliability

A H9 é uma release de correção e consolidação. Ela não adiciona um novo canal; fecha falhas encontradas na execução real do WhatsApp QR + Central de Comunicação da H8.

## Bugs corrigidos

- **Perda de histórico após sincronizar:** o QR bridge e o gateway podiam salvar snapshots diferentes do mesmo store. Um snapshot antigo podia sobrescrever mensagens recém-importadas. O store agora faz merge determinístico de eventos e contas antes da gravação.
- **Sincronizações concorrentes:** importação inicial, botão Sincronizar e job de background podiam rodar ao mesmo tempo. A sessão agora possui mutex de sincronização; sync manual aguarda a incremental e executa a varredura completa em seguida.
- **Deduplicação entre workspaces:** `externalMessageId` não é mais tratado como global. A identidade inclui workspace, conta e canal.
- **Envio duplicado/desvinculado:** se `message_create` chegava antes da resposta do `/send`, o evento ao vivo ganhava a corrida e podia ficar sem `leadId/contactId`. Eventos duplicados agora são mesclados e enriquecidos.
- **Contador de não lidas inflado:** mensagens antigas importadas do WhatsApp Web passam a entrar como já vistas pelo CRM. Mensagens novas ao vivo continuam gerando `Responder/Não lidas`.
- **Leitura no CRM:** abrir uma conversa WhatsApp local marca a conversa como lida no CRM sem fingir que houve blue tick no WhatsApp.
- **Chats `@lid`:** o bridge resolve o `Contact` do WhatsApp Web para obter o número real da outra ponta. Em conversas 1:1, esse número vira a identidade canônica, unificando aliases `@lid` e `@c.us` sem misturar números diferentes do mesmo lead.
- **Dois números do mesmo lead:** threads distintas do WhatsApp não são mais colapsadas apenas porque foram vinculadas ao mesmo Lead.
- **Cloud + QR:** webhook Cloud agora grava `peerAddress` e atualiza status com escopo da conta/workspace, evitando colisões com outra conexão.
- **Falhas silenciosas:** Sincronizar retorna falhas por conta; a UI deixa de informar “nenhuma mensagem nova” quando uma conta realmente falhou.
- **Semântica visual:** QR Local deixa de aparecer como integração “Oficial”. Cloud API continua marcada como oficial.
- **Busca:** a busca da Central passa a considerar o conteúdo de todas as mensagens da conversa, não apenas o último preview.

## Persistência e segurança operacional

O store continua local ao Linux e protegido por permissões de arquivo. A H9 mantém a sessão WhatsApp Web da release anterior por migração automática quando as pastas estão lado a lado.

## Compatibilidade

Preserva H8 History Sync, H7 Chat Workspace, H6 installer, H5 Chromium/WhatsApp Web, H4 QR, Official Communications, Contact Identity Sync e Connect One-Tap.
