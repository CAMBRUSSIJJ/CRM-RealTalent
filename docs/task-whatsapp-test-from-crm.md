# Testar WhatsApp diretamente no RealTalent CRM

## Escopo
Teste **manual** de uma única mensagem de tarefa usando **o mesmo WhatsApp conectado via QR Code ao gateway de Comunicação** do RealTalent. Não depende de Meta Cloud API, Resend, Cron nem da fila externa de lembretes. Não habilita notificações automáticas.

## Passo a passo no CRM
1. Abra o RealTalent no ambiente em que o gateway está acessível. Em **Configurações → WhatsApp**, confirme que a sessão **WhatsApp por QR Code** está conectada. Não é necessário desconectar a conta existente.
2. Vá a **Tarefas → Nova tarefa**; preencha título e prazo futuro e selecione **seu próprio usuário** como responsável. Salve.
3. Na página **Tarefas**, clique em **Testar lembrete WhatsApp**.
4. Aguarde a conferência da conexão: deve informar **WhatsApp QR conectado** e o número que envia.
5. Selecione uma das suas tarefas abertas, informe o WhatsApp pessoal **com +55 e DDD** e confirme que o número é seu e que autoriza **um único envio real**.
6. Clique em **Enviar teste para meu WhatsApp**. Verifique a conversa no CRM e a mensagem no celular.

## Mensagens de status
- **Mensagem aceita pelo gateway**: o gateway informou envio; confira o recebimento no WhatsApp. Aceitação não é comprovação de entrega/leitura.
- **Mensagem colocada na fila**: a sessão não confirmou envio imediato. **Não clique de novo** sem conferir a conversa: pode duplicar.
- **WhatsApp não disponível**: gateway não acessível, erro de autenticação Vercel ↔ Railway ou sessão QR desconectada. Corrija a conexão nas Configurações primeiro.
- **Sem tarefas**: atribua uma tarefa aberta ao próprio usuário, pois o teste manual intencionalmente não envia mensagens para terceiros.

## Limites deliberados
- Disponível só na **branch de teste** até haver preview com esse HEAD e aprovação de QA. Não confundir com produção do RealTalent.
- O número digitado não é salvo nem declarado 'verificado' para o subsistema de automação. A confirmação vale apenas para essa mensagem manual.
- O mecanismo QR é não oficial, sujeito a problemas de sessão e políticas do WhatsApp. Para disparos automáticos a funcionários, usar a Cloud API com opt-in, telefone verificado e template aprovado.
- Não reenviar uma solicitação de resultado desconhecido, porque o gateway pode ter colocado o envio na fila.
- A autenticação HTTP 401 conhecida entre Vercel e Railway pode impedir esse teste em versões web, mesmo quando o WhatsApp local estiver conectado.
