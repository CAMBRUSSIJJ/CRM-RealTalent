# RealTalent Connect — instalação e pareamento simples (Linux)

## O que já é possível fazer
O RealTalent Connect configura o conector WhatsApp sem pedir `service_role`, URL
do Supabase, ID de workspace, QR gerado fora do CRM, nem edição de arquivos `.env`.
O único passo de segurança é digitar o código temporário gerado no CRM.

1. Instalar o aplicativo uma vez pelo instalador `INSTALAR.sh`.
2. Abrir **Aplicativos → RealTalent Connect** (interface local em `127.0.0.1:4375`).
3. No CRM **Configurações → WhatsApp → Gerar código para o aplicativo**.
4. Copiar o código de 16 caracteres para o RealTalent Connect (expira em 5 min).
5. O programa salva credencial revogável só para aquele workspace, gera as senhas
   locais automaticamente, ativa o Docker e inicia com sua sessão Linux.
6. Voltar ao CRM e clicar **Gerar QR Code**; depois escanear com o WhatsApp do telefone.
7. Em Notificações: usuário autoriza número, recebe código, confirma e cria tarefa
   atribuída com canal WhatsApp.

## Pré-requisitos
- Linux Debian ou Ubuntu com ambiente de desktop.
- Node.js **22**, Git e Internet.
- Docker Engine + Docker Compose v2: o instalador pergunta se deve instalar
  automaticamente via `sudo` quando ausentes. Instalação de Docker precisa da senha
  do administrador **uma vez**; a permissão `docker` é equivalente a controle
  administrativo do computador e pode exigir sair e entrar no Linux novamente.
- O computador deve permanecer ligado para enviar e receber WhatsApp.

## Segurança e arquitetura
- O app roda painel HTTP **somente em 127.0.0.1**, protegido contra POST de sites
  externos pelo cabeçalho Origin e um token CSRF. Evolution API também limita
  portas a 127.0.0.1. Redis e Postgres não expõem portas.
- A conta do CRM autoriza o vínculo por JWT válido + papel owner/admin, e gera
  80 bits aleatórios de código único válido por 5 min; só SHA-256 fica na tabela.
- A função `whatsapp-connect` troca o código por um token aleatório de 256 bits,
  cujo SHA-256 fica no Supabase. O Linux guarda só esse token de dispositivo,
  nunca a chave `service_role`. Seu administrador pode revogar a associação.
- O app faz heartbeat, recebe comandos para obter QR, envia códigos de verificação
  e notificações da fila **existente** `task_notification_outbox`, sem duplicação.
- Resultados incertos são bloqueados, sem envio automático de duplicata.
- Para impedir dois conectores simultâneos, **não inicie o conector manual antigo**
  e o RealTalent Connect na mesma organização.
- O projeto de Docker novo usa volumes próprios, preservando os antigos; não execute
  `docker compose down -v`.

## Limites conhecidos
**Ainda não foi migrado o histórico de conversas, mensagens recebidas e mídias
(áudios, imagens e documentos)** do gateway antigo para o Evolution local.
Essa etapa requer sincronização de mensagens e anexos antes de desligar Railway.
O teste de QR e de envio real exige o Linux do usuário; não há confirmação ainda.

## Diagnóstico
- Abra `http://127.0.0.1:4375/`.
- Se Docker estiver ausente, o instalador pode instalar no Debian/Ubuntu após
  sua autorização. Se der erro de grupo, saia da sessão Linux e entre novamente.
- Para logs locais sem mostrar credenciais:
  `journalctl --user -u realtalent-connect -n 40 --no-pager`
- Para ver serviços:
  `docker compose --project-name realtalent-connect -f ~/.local/share/realtalent-connect/compose.yaml ps`
- O QR e o status ficam no CRM; o aplicativo local não exibe o token privado.
