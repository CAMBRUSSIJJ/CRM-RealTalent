# RealTalent — Notificações de tarefas usando o WAHA GOWS local

## Objetivo
A partir desta prévia (PR #72), os avisos de atribuição no **CRM local** são agendados e enviados usando a **mesma sessão WhatsApp WAHA realtalent** já conectada à Comunicação / IA. Não precisa ler outro QR Code.

## Segurança e consentimento
- O registro de telefone em Equipes **não constitui consentimento**. É necessário que o destinatário tenha autorizado explicitamente e que o administrador confirme isso na edição do integrante.
- Somente o botão de salvar do editor de notificações pode registrar ou revogar consentimento na fila local autenticada. A sincronização automática do navegador nunca pode habilitar envio.
- As notificações se limitam a tarefas abertas, com `reminderEnabled` e `reminderOnAssignment`, e a destinatários com opt-in da automação.
- O WAHA resolve o `chatId` pelo telefone usando `check-exists`; não aceita destinos de grupo nem mensagens enviadas sem consentimento.
- A fila grava cada tentativa **antes** do transporte e não reenvia automaticamente mensagens com resultado incerto. Mensagens fora do prazo de validade expiram.
- Um aceite da API do WAHA significa **aceito para processamento**, não comprova que o destinatário leu ou recebeu.

## Teste controlado no Linux
1. Feche apenas a prévia CRM em 5174 e a ponte WAHA em 4392 que a iniciou. Não desligue o contêiner WAHA na porta 4385.
2. Execute `bash deploy/waha-direct/instalar-e-abrir-ia-audios-linux.sh` no checkout desta PR. O serviço local usa `~/.local/share/realtalent-waha-direct/task-notification-outbox.json` para a fila persistente.
3. Abra o CRM `http://127.0.0.1:5174/`, conecte o WAHA Direct em Comunicação usando a chave da ponte (não compartilhe a chave).
4. Em **Equipes > Pessoas** na prévia local, abra o integrante que autorizou receber mensagens, cadastre o número **+55 DDD número**, confirme a autorização **real** e marque a automação. Salve e aguarde confirmação do gateway.
5. Em **Tarefas > Nova tarefa**, selecione aquele integrante, mantenha **Lembretes** e **Avisar ao atribuir** habilitados, depois salve.
6. Abra **Tarefas > ícone de sino > Comunicação e automações**, verifique estados **Programado / Aceito pelo gateway / Falhou / Bloqueado**. Confira a chegada no segundo WhatsApp autorizado.
7. Verifique que (a) tarefa atribuída sem autorização não envia; (b) edição da mesma tarefa não duplica; (c) cancelar tarefa antes do prazo não envia; (d) não há reenvio depois de erro incerto.

## Supabase hospedado (produção)
O canal Supabase oficial é separado da prévia WAHA. Há registro de `whatsapp_consent_required` e nenhum perfil de preferência/telefone verificado no banco na auditoria de 06/11/2026. **Não alterar nem preencher consentimento por automação.** Cada integrante deve autorizar e concluir a verificação oficial antes dos envios hospedados.

## Railway: volume quase cheio
O runtime de produção tem volume persistente de **500 MB** em `/data` e apresenta erros `ENOSPC`. A ferramenta conectada ao Railway permite criar, montar ou renomear volumes, **mas não redimensionar o volume existente**. Não substitua o volume por um vazio — isso ocultaria os dados existentes e interromperia a sessão WhatsApp.
- Antes de qualquer limpeza, faça backup/snapshot do volume pelo Railway.
- Aumente a capacidade **do volume atual** pelo painel Railway, se a opção estiver disponível no seu plano. Recomenda-se verificar o consumo por diretório para dimensionar a expansão.
- Não remova `/data/communications`, sessões QR ou arquivos do estado das notificações.
- Após ampliar, verifique que os erros `ENOSPC` cessaram e os serviços continuam conectados.

## Limites
- Notificações locais só são processadas enquanto a ponte WAHA 4392 está aberta no Linux. A fila sobrevive à reinicialização, mas eventos antigos expirados **não serão reenviados**.
- A fila do gateway QR antigo não é migrada automaticamente para evitar notificações duplicadas.
- Estas alterações **não foram publicadas** no Production e precisam de aceite com uma mensagem real para um destinatário autorizado antes de qualquer implantação.
