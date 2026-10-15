# RealTalent CRM V101.10.7 — Security & Runtime Foundation

Base: **V101.10.6-H2 — Global Selection & Ownership Fix**.

Esta release endurece os serviços locais e a cadeia de execução sem redesenhar o CRM e sem migrar o banco local para IndexedDB.

## H1 — Gateway Security

- CRM passa a acessar **Communications Gateway** e **RealTalent Connect** por proxies locais do Vite/launcher;
- launcher gera um `REALTALENT_RUNTIME_TOKEN` aleatório em arquivo local com permissão restrita e o injeta entre processos;
- token não é embutido no bundle do navegador;
- APIs internas validam autenticação de runtime, `Host` e `Origin`;
- respostas internas usam `no-store` e `nosniff`;
- payloads JSON passam a ter limite explícito;
- callbacks OAuth escapam conteúdo dinâmico antes de montar HTML e usam CSP restritiva.

## H2 — Connect Pairing Security

- listener principal do RealTalent Connect fica preso a `127.0.0.1`;
- o celular **não recebe acesso à LAN por padrão**;
- Configurações → Ligações passa a mostrar **Apenas este computador** e a ação **Permitir celular na rede local**;
- ao habilitar, um segundo listener é aberto apenas no IP privado escolhido; ao desabilitar, ele é fechado;
- pareamento de 6 dígitos expira em 5 minutos por padrão;
- após 5 tentativas inválidas, o IP é bloqueado temporariamente por 60 segundos e recebe `429` + `Retry-After`;
- QR, diagnósticos, dispositivos e comandos internos passam pelo canal autenticado;
- WebSocket do CRM também valida origem/autenticação;
- estado de liberação LAN fica em `.realtalent-connect-network.json` e inicia desativado.

## H3 — Webhook Hardening

- webhook do WhatsApp deixa de operar em modo fail-open;
- sem `metaAppSecret`, POST externo retorna `503` em vez de aceitar evento;
- assinatura `X-Hub-Signature-256` é validada com comparação timing-safe;
- verificação GET sem token configurado também falha fechada;
- `Host` externo para o gateway só é aceito quando explicitamente adicionado a `REALTALENT_COMMUNICATIONS_ALLOWED_HOSTS`.

## H4 — Lockfile + Fast Launcher

`./start-linux.sh` agora possui três modos:

```bash
./start-linux.sh
# abertura normal: valida a fundação V101.10.7 e reutiliza o build aprovado

./start-linux.sh --verify
# auditoria completa: preflight, npm audit, release:verify e build

./start-linux.sh --rebuild
# limpa caches/dist e recompila deliberadamente
```

- dependências passam a ser instaladas por `npm ci --no-fund`, não por `npm install` livre;
- SHA-256 do `package-lock.json` é usado para decidir quando `node_modules` precisa ser reconstruído;
- `npm audit` foi reativado em `.npmrc`;
- o launcher não apaga/recompila `dist` em toda abertura normal;
- primeira abertura de uma pasta sem build V101.10.7 compila uma vez; aberturas seguintes reutilizam o build aprovado;
- migração procura primeiro a pasta V101.10.6-H2 para preservar sessão/configuração de comunicações e histórico/fila do Garimpo.

## UX preservada

Não houve redesign global. A alteração visível deliberada é a área de segurança do RealTalent Connect, que diferencia:

- **Apenas este computador**;
- **Celular liberado na rede local**.

## Fora de escopo desta release

- migração de `localStorage` para IndexedDB;
- limpeza arquitetural ampla;
- troca do motor `whatsapp-web.js`/Puppeteer;
- novo desenho de CRM;
- novas features comerciais.

Esses itens ficam para releases posteriores, após esta fundação estar estável no Linux real.
