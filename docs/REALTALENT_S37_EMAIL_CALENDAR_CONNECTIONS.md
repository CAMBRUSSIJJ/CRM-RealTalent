# RealTalent S3.7 — Central de E-mail + estratégia de Agenda integrada
Data: 2026-10-29
Base: S3.6 WhatsApp Quiet Send
PR: #27 (rascunho, sem merge em Production)

## Problemas observados
- WhatsApp e E-mail não preenchiam o espaço até o limite inferior da janela: as alturas fixas `100vh - 140/190px` não consideravam a posição real da Central abaixo do cabeçalho global.
- A Central E-mail mostrava zero mensagens e nenhum botão para conectar conta.
- O gateway de comunicações S3.5 roda na porta **3012**; o assistente de OAuth ainda exibia **3002**. A URI OAuth deve coincidir exatamente com a registrada no provedor.
- Algumas rotas de envio/consulta/sincronização de mensagens e OAuth ainda decidiam local vs. nuvem somente pela existência de credenciais Supabase, ignorando o modo local escolhido pelo usuário.
- O CRM ocultava e-mails importados que não tinham lead vinculado.

## Mudanças implementadas
1. **Altura real do chat**: a tela mede a posição da área de conversas e usa `innerHeight - top - 10px`, recalculando ao redimensionar. O histórico e a lista têm scroll próprio; o composer permanece dentro da área disponível. Em telas <=900px a página continua rolável, com limites apropriados.
2. **Conectar e-mail pela Central**: quando não há contas oficiais, exibe Gmail e Microsoft Outlook com botões reais de OAuth, verificação de disponibilidade do gateway, permissões e mensagens de configuração. Nenhum botão finge conexão.
3. **Credenciais OAuth locais**: cadastre no Google Cloud Console/Microsoft Entra:
   - Google URI: `http://127.0.0.1:3012/oauth/google/callback`
   - Microsoft URI: `http://localhost:3012/oauth/microsoft/callback`
   O assistente `bash configure-communications-local.sh` da pasta do projeto grava Client IDs e secrets fora do navegador e informa URLs conforme o gateway. **Execute e reinicie o RealTalent antes de conectar**. Configurar o consentimento OAuth e o registro no provedor é uma ação manual do proprietário da conta.
4. **Backend escolhido corretamente**: `communication-workspace-core` e início de OAuth usam o modo explícito do CRM. Em local, e-mail usa gateway Linux; em Supabase usa as funções hospedadas.
5. **Retorno OAuth**: ao receber sinal `integration=connected&provider=google|microsoft`, a Central E-mail abre e sincroniza uma vez, removendo as flags. Token não entra na URL do CRM.
6. **E-mails sem lead**: a Central agora exibe conteúdo de mensagens oficiais sem vínculo, em modo leitura. Para responder oficialmente, exige vincular o remetente a um contato do CRM; não inventa destinatários ou registros.

## Arquitetura recomendada para Agenda
**Escolha: Supabase hospedado + OAuth por provedor + sincronização incremental bidirecional.**
- Não duplicar a integração de calendário dentro do gateway Linux de e-mail. O gateway local atual anuncia `calendar_read=false`, `calendar_write=false`; não significa que o calendário já está funcionando.
- Usar o `CalendarIntegrationPanel` e `calendar-integration.ts` existentes, com functions `integration-oauth-start/callback`, `integration-calendar-catalog`, workers de Google/Microsoft, vínculos externos, filas, retries e conflitos.
- Para Google, consentimento com escopos mínimos de Calendário + acesso offline; sincronização incremental via `syncToken` e notificação push com revalidação.
- Para Microsoft, permissões delegadas de calendário via OAuth PKCE e refresh offline; Microsoft Graph `calendarView/delta` ou endpoint delta suportado, com notificações quando disponíveis.
- Quando o usuário já conectou e-mail, a mesma identidade pode ser reutilizada no workspace, **mas permissões de calendário precisam de consentimento próprio se não foram concedidas**. Não reutilize um token que só tem Gmail/Outlook Mail.Read/Send.
- O usuário escolhe calendário, define direção (`CRM→externo`, `externo→CRM` ou bidirecional), executa teste e ativa.
- A Agenda interna do RealTalent permanece funcional mesmo sem conta externa.
- Reconciliar por vínculo externo idempotente e versão/ETag; conflitos exigem revisão, nunca sobrescrita automática silenciosa.

## Como ativar E-mail local
1. Feche o CRM anterior que utiliza 4197.
2. Abra a branch S3.7 com `scripts/garimpo-g1g2-linux/abrir-com-diagnostico.sh`. O runtime isolado inicia WhatsApp em 3012.
3. Na pasta da branch, execute `bash configure-communications-local.sh` (não copie secrets para o chat).
4. No Google Cloud/Entra, registre exatamente as URLs exibidas; confira consentimento, escopos e client type.
5. Reinicie o launcher. Abra `http://127.0.0.1:4197/#/communications`, selecione E-mail e clique em Conectar Google/Microsoft.
6. Complete a autorização no provedor. Ao retornar, a Central sincroniza; depois selecione uma conversa para ler/responder.
7. Se a interface disser gateway offline, execute `bash scripts/garimpo-g1g2-linux/diagnosticar-runtime.sh` e verifique a saúde local. HTTP 502 indica proxy/serviço ausente, não um OAuth concluído.

## Limites/aceite
- Nenhuma credencial Google/Microsoft foi criada, cadastrada ou autorizada por esta PR. Conexão real só pode ser validada no computador/conta do usuário.
- Calendário remoto não foi ativado nem implantado em Production. Novo fluxo guiado para ambiente hospedado, preservando workers existentes.
- Contas de e-mail precisam de autorização real e scopes válidos; resultados só aparecem após sincronização.
- Validar Firefox 1280×720 e 1920×1080: composer e lista devem chegar até a parte inferior, sem espaço vazio e sem scroll externo desnecessário.
- Validar OAuth Google/Outlook com credenciais de teste (não no CI), reconexão, envio, recebimento e histórico sem lead.
- Validar que WhatsApp, Garimpo G1/G2/G3 e IA local continuam funcionando.
- Não promover a Production sem teste end-to-end de e-mail e agenda hospedada.
