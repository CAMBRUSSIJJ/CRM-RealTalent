# Ponte WAHA GOWS → RealTalent (Linux)

Implementação inicial sem alterar o CRM publicado, o Railway ou a sessão GOWS autenticada. Utiliza o registro Supabase já existente `public.whatsapp_local_bridge` e acesso somente de saída.

## Executar pelo Linux
```bash
cd ~/Downloads
curl -fsSL 'https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/waha-local-bridge-20261105/deploy/waha-bridge/install.sh' -o instalar-waha-crm.sh
bash instalar-waha-crm.sh
```

Requisitos: Node.js 22+, WAHA local em `http://127.0.0.1:4385`, sessão `realtalent` já com status `WORKING`, acesso administrativo ao projeto Supabase do RealTalent.

Na primeira execução, o instalador solicita **privadamente no terminal** `SUPABASE_SERVICE_ROLE_KEY`. **Nunca envie essa chave no chat ou GitHub**. O arquivo de credenciais é armazenado em `~/.config/realtalent-waha-bridge/.env`, com permissão 600. Como é uma chave administrativa, use somente em computador próprio e protegido.

O instalador consulta no Supabase o workspace já configurado em `whatsapp_local_bridge` quando há somente um; caso contrário, solicita seu UUID. Ele não modifica a tabela ou solicita um novo pareamento. A ponte comunica `WORKING → open`, envia `heartbeat_at` e `offline` quando WAHA não está acessível. O CRM consulta esses dados pela Edge Function `whatsapp-session` já existente.

**A versão via GitHub é status-only**: não envia mensagens, não sincroniza chats nem anexos e não consome a fila de tarefas. Para testes locais adicionais de notificações protegidas por consentimento, há um pacote separado de diagnóstico e testes, com envio inicialmente desabilitado.

O serviço roda enquanto o terminal permanece aberto; `Ctrl+C` para parar a ponte. O WAHA original continua funcionando. O computador deve permanecer ligado para a ponte atualizar o CRM. Nenhuma porta local é publicada externamente.
