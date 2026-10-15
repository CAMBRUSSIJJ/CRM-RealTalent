# RealTalent Cloud Runtime Host

Este host persistente executa três processos atrás de uma única porta HTTPS do provedor:

- `/agent/*` → RealTalent Agent `:8791`
- `/communications/*` → Communications Gateway `:3002`
- `/prospecting/*` → Prospecting Agent `:4319`
- `/health` → readiness agregado

## Vercel
Se este container for publicado em `https://runtime.seudominio.com`, configure:

```env
REALTALENT_AGENT_UPSTREAM_URL=https://runtime.seudominio.com/agent
REALTALENT_COMMUNICATIONS_UPSTREAM_URL=https://runtime.seudominio.com/communications
REALTALENT_PROSPECTING_UPSTREAM_URL=https://runtime.seudominio.com/prospecting
```

Os três tokens devem ser os mesmos nos dois ambientes (Vercel e runtime host), mas nunca devem usar prefixo `VITE_`.

## OAuth
Para Gmail/Outlook, use `REALTALENT_COMMUNICATIONS_PUBLIC_URL=https://runtime.seudominio.com/communications`. Registre como callbacks:

- Google: `https://runtime.seudominio.com/communications/oauth/google/callback`
- Microsoft: `https://runtime.seudominio.com/communications/oauth/microsoft/callback`

`REALTALENT_PUBLIC_APP_URL` deve ser o domínio HTTPS do CRM para que o callback retorne ao CRM sem aceitar redirecionamento aberto.

## Persistência
Monte `/data` como volume persistente. Ele contém memória/estado da Agent, credenciais cifradas e mídia/sessões do Communications Gateway e jobs do Garimpo.
