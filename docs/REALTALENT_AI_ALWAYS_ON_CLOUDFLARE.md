# RealTalent AI permanente: Linux + Cloudflare Access + Vercel

## Objetivo
Executar Qwen3 8B no computador Linux e manter Ollama, Agent e ponte autenticada como serviços systemd com recuperação automática. O CRM publicado usa um proxy server-side autenticado via Supabase, com duas credenciais adicionais para Cloudflare Access.

**Não é hospedagem 24/7:** o computador deve ficar ligado e conectado. Não há provedor de IA de reserva pago ativado.

## Fluxo de rede
```
CRM navegador (sessão Supabase)
  -> Vercel /api/runtime/agent/tools/*
    -> Cloudflare Access [CF-Access-Client-Id + CF-Access-Client-Secret]
      -> Tunnel (conexão de saída iniciada pelo Linux)
        -> 127.0.0.1:8798 (bridge com token REALTALENT_AGENT_RUNTIME_TOKEN)
          -> 127.0.0.1:8792 (Agent Runtime)
            -> 127.0.0.1:11434 (Ollama / Qwen3 8B)
```

Não apontar o Tunnel para 11434 ou 8792. Não mudar Ollama/Agent para 0.0.0.0.

## Configuração do Linux
Instalar Node.js 22, npm, Git, Ollama e cloudflared (pacotes oficiais). O pacote Linux desta entrega oferece `start-linux.sh`, `configurar-tunnel.sh`, `diagnosticar.sh` e `configurar-vercel.sh` para executar os serviços com systemd --user. O segredo local é gerado na máquina e nunca é enviado para o GitHub.

## Cloudflare
1. Criar Tunnel remotamente gerenciado no Zero Trust / Networking > Tunnels.
2. Publicar hostname próprio `ia.seudominio.com`, serviço `http://127.0.0.1:8798`.
3. Criar Service Token em Access controls > Service credentials > Service Tokens.
4. Criar Application self-hosted para `ia.seudominio.com`, policy **Service Auth** apenas para esse token. **Não usar Bypass/Everyone**.
5. Configurar token do Tunnel somente no Linux, como arquivo chmod 600.

Documentação: https://developers.cloudflare.com/tunnel/get-started/ e https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/

## Vercel: variáveis privadas (Production e Preview)
- `REALTALENT_AGENT_UPSTREAM_URL=https://ia.seudominio.com`
- `REALTALENT_AGENT_RUNTIME_TOKEN=<mesmo token local do bridge>`
- `REALTALENT_CF_ACCESS_CLIENT_ID=<Client ID do Cloudflare Service Token>`
- `REALTALENT_CF_ACCESS_CLIENT_SECRET=<Client Secret do Cloudflare Service Token>`

**Nunca adicionar prefixo VITE_ a tokens.** O backend protege as credenciais e rejeita configuração Cloudflare incompleta sem retornar segredo ao browser. Se as duas variáveis Cloudflare estiverem ausentes, o backend mantém compatibilidade com o upstream Railway já existente; não mudar o upstream até a rota Access estar validada.

## Ordem segura do rollout
1. Instalar Linux, testar Ollama, Agent e bridge; sem token o bridge deve retornar 401.
2. Configurar Cloudflare Tunnel e Access; testar 401/403 sem Access token, depois 200 com Access + token interno.
3. Adicionar variáveis em **Preview**, executar novo deploy e testar o chat com conta Supabase.
4. Validar fluxo real de Qwen (não só healthcheck), logs, streaming e reconexão.
5. Somente depois promover Production; manter rollback disponível.
6. Se o Vercel bloquear por cota diária, **não alterar upstream/segredos em Production**.

## Limites
- Servidor Cloudflare Access não substitui autenticação da própria ponte.
- Modelo pode descarregar da VRAM em idle sem tornar o serviço offline.
- Rede, desligamento ou suspensão do Linux interrompem a IA.
- Para responder com Linux desligado: segunda instância de IA em servidor com capacidade adequada ou provedor pago, mediante orçamento e aprovação.
