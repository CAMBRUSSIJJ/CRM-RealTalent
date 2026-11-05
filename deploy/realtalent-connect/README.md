# RealTalent Connect — WhatsApp Web nativo (sem Evolution)
Versão de teste para RealTalent V101.11.3. Mantém o CRM da Vercel e o pareamento já existente com o Supabase.

## O que muda
- O aplicativo Linux utiliza `whatsapp-web.js@1.34.7` e `qrcode@1.5.4`.
- A sessão é armazenada em `~/.config/realtalent-connect/whatsapp-web-session`.
- O vínculo do dispositivo com o Supabase continua em `~/.config/realtalent-connect/device.json` (não enviar).
- Não utiliza o container Evolution, PostgreSQL ou Redis para gerar o QR.
- O instalador para somente os containers do projeto local `realtalent-connect`, sem remover volumes ou configurações.
- O QR aparece em `http://127.0.0.1:4375/` e também é enviado pela função `whatsapp-connect` já publicada no Supabase.
- Notificações de tarefas continuam usando a fila existente e os requisitos de consentimento e telefone verificado. Resultado incerto bloqueia reenvio automático.

## Instalar
1. Baixe e extraia o ZIP de inicialização da versão WhatsApp Web nativa.
2. Execute `bash start-linux.sh`. Ele clona/atualiza apenas a branch de teste e roda `deploy/realtalent-connect/instalar-linux.sh`.
3. Node 22 e npm são necessários. O instalador prepara o motor e baixa Chromium automaticamente se nenhum navegador compatível estiver instalado.
4. Abra **Aplicativos → RealTalent Connect**, ou `http://127.0.0.1:4375/`.
5. **Se o computador já está vinculado ao CRM, não é necessário outro código**.
6. Espere o QR aparecer no próprio aplicativo. No telefone: WhatsApp → Dispositivos conectados → Conectar dispositivo.
7. Se o QR não aparecer, clique **Verificar problema do QR**; agora o diagnóstico mostra `WhatsApp Web` e o caminho do Chromium, não Evolution.

## Segurança e preservação
- Não se usa a chave `service_role` no computador. O aplicativo retém apenas um token de dispositivo revogável.
- O navegador local só escuta `127.0.0.1:4375`, com verificações de Origin/CSRF.
- O QR é um segredo temporário: não compartilhar capturas do QR.
- O instalador **não** executa `docker compose down -v`, `logout`, `rm -rf`, `db reset` ou comando que remova sessões.
- A sessão do gateway Railway é independente e não é alterada. Deixe Railway ativo até migrar chat e mídia.
- Nunca exponha o arquivo `device.json` ou os diretórios `whatsapp-web-session`.

## Limites
Esta entrega substitui **o motor de conexão** do RealTalent Connect e liga o QR e os avisos de tarefas ao Supabase. A sincronização de conversas recebidas, grupos, anexos e histórico do Railway **não foi migrada ainda** para o transporte Web nativo. A comunicação pode continuar pelo gateway legado durante o teste, sem atribuir indevidamente o estado 'conectado' ao chat antigo.

O WhatsApp Web é uma integração não oficial e pode sofrer mudanças de compatibilidade. A conexão precisa ser validada no Linux real, incluindo Chromium e leitura do QR, antes de promover a branch para produção.

## Diagnóstico seguro
```bash
systemctl --user status realtalent-connect.service
journalctl --user -u realtalent-connect.service -n 40 --no-pager
```
Evite enviar logs que possam revelar números, QR ou mensagens.
