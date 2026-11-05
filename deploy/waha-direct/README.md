# RealTalent Comunicações + WAHA GOWS (direto, sem Supabase)

## Objetivo
Conectar a sessão **realtalent** já autenticada no WAHA GOWS à nova aba **Comunicações** do CRM, sem colocar a chave WAHA no navegador e sem usar Supabase, Railway ou Evolution para mensagens.

## Instalar no Linux
É necessário ter Node.js 22+, WAHA funcionando em \`http://127.0.0.1:4385\` e a sessão \`realtalent\` em WORKING.

\`\`\`bash
cd ~/Downloads
curl -fL "https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/waha-direct-communications-20261105/deploy/waha-direct/start-linux.sh" -o abrir-waha-realtalent.sh
bash abrir-waha-realtalent.sh
\`\`\`

O script:
1. Verifica a sessão WORKING sem exibir a chave WAHA.
2. Baixa a ponte do repositório e verifica a sintaxe.
3. Inicia serviço **127.0.0.1:4390**, acessível somente neste computador.
4. Abre a página local com a chave de conexão do CRM. Copie-a para **Comunicações**. A chave é diferente de WAHA_API_KEY.
5. Não recria o contêiner Docker, não solicita novo QR Code e não modifica a pasta persistente do WAHA.

**Não copie nenhuma chave para a conversa ou em prints.** A chave local é guardada em \`~/.local/share/realtalent-waha-direct/access-token\`, com permissão 600.

## Funcionalidades implementadas
- Status da sessão, conversas paginadas, histórico de textos.
- Mensagens recebidas por eventos WAHA \`message.any\`/\`message.ack\` com SSE e sondagem de recuperação.
- Envio manual por \`POST /api/sendText\`.
- Nova conversa: o número é resolvido primeiro em \`/api/contacts/check-exists\`, evitando o erro de \`no LID found\`.
- Proteção contra duplo envio por identificador de requisição, e confirmação explícita após resultados ambíguos.
- Os dados das conversas são consultados diretamente na API, **sem sincronização automática no Supabase**.

## Limites
- **Esta fase é local**. Só funciona no browser do computador com o WAHA. O CRM Vercel aberto em outro computador não alcança 127.0.0.1. O acesso remoto exigirá túnel seguro/autenticado em fase posterior.
- A interface exibe a **presença** de imagens, áudios e arquivos, mas ainda não reproduz/baixa mídias.
- Sem envio automático de lembretes, automações ou disparos em massa.
- O CRM pode continuar usando Supabase em outras funções. **O módulo WhatsApp não exige Supabase.**
- A branch é de **prévia**, não production; valide envio, recebimento e interface antes de promover.

## Segurança
- Somente localhost: bind em 127.0.0.1.
- Chave WAHA obtida do arquivo do WAHA local, nunca exposta no frontend.
- Chave aleatória própria para a ponte, enviada no header Authorization.
- CORS restrito à origem oficial \`https://crm-real-talent.vercel.app\` e servidores locais de desenvolvimento. Para uma prévia da Vercel, use \`REALTALENT_WAHA_ALLOWED_ORIGINS=https://<endereço-exato-da-prévia>\` ao iniciar a ponte, sem curingas.
- Sem armazenamento de conversas e tokens na nuvem.
- A chave da ponte é guardada só em sessionStorage no navegador; ao trocar de navegador/aba, é necessário autorizar novamente.

## Testes
\`\`\`bash
node --test deploy/waha-direct/server.test.mjs
npm run typecheck
npm run build
\`\`\`
