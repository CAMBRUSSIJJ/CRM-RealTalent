# RealTalent Connect — Piloto SIP.js (07/11/2026)

## Escopo entregue

Piloto independente de telefonia VoIP no navegador, desenvolvido com a API **Web.SimpleUser** do [SIP.js](https://github.com/onsip/SIP.js) 0.21.2 (MIT).

- **Tela:** `public/sip-phone.html`, publicada localmente em `http://127.0.0.1:4188/sip-phone.html` quando o CRM local está no ar.
- **Entrada na interface:** Configurações → Ligações → Configuração avançada → Laboratório VoIP · SIP.js → Abrir piloto VoIP.
- **Operações disponíveis:** autenticar ramal SIP por WSS/WebRTC, registrar, originar/receber chamadas, atender/recusar, encerrar, mute/unmute, hold/unhold, DTMF e ouvir o áudio remoto.
- **Não altera:** o RealTalent Connect na porta 3001, o pareamento do iPhone, o provider padrão do CRM, o RealTalent Phone, os controles do Calling Workspace, o Supabase nem a implantação Vercel.
- **Segurança:** campo de senha não é persistido via localStorage, sessionStorage ou backend do CRM. Conexão feita diretamente ao PBX informado. Desconectar limpa o campo; a sessão SIP permanece apenas na memória enquanto o piloto estiver aberto.

## Pré-requisitos

1. Abrir **CRM local**, por HTTPS ou localhost; acesso ao microfone precisa de origem segura.
2. Um PBX compatível com **SIP sobre WebSocket (WSS) + WebRTC** (por exemplo, Asterisk/MikoPBX configurado para isso). Ter o endereço WSS (ex.: `wss://pbx.seudominio.com:8089/ws`).
3. Um **ramal SIP** com AOR (ex.: `sip:200@pbx.seudominio.com`), usuário de autenticação e senha.
4. Microfone e saída de áudio; permissão do navegador.
5. Internet para baixar a versão pinada do SIP.js do jsDelivr. Esta fase de piloto **não** é offline e não faz cópia local do pacote.

Para ligar para um telefone da operadora (PSTN), o PBX precisa ter **tronco/trunk telefônico** e regras de discagem de saída. O software livre sozinho não oferece chamadas gratuitas a celulares.

## Teste local controlado

1. Faça checkout da branch `feat/realtalent-connect-sip-pilot-20261107`.
2. Instale as dependências do CRM, inicie com `./start-linux.sh` e abra o endereço local exibido pelo launcher. Alternativamente, abra a página diretamente em `http://127.0.0.1:4188/sip-phone.html`.
3. Em Configurações → Ligações, expanda **Configuração avançada** e escolha **Abrir piloto VoIP**.
4. Informe o endereço WSS, a URI SIP, o usuário e a senha fornecidos pelo administrador da central.
5. Clique em **Conectar e registrar**. Confirme o estado **Ramal SIP registrado**. A senha digitada é apagada do campo após o registro.
6. Ligue primeiro para **outro ramal de testes** da mesma central. Clique em **Ligar**; confirme estados e áudio bidirecional.
7. Teste mute, hold, retomada, DTMF, encerramento e uma chamada entrante. Verifique se o PBX registra corretamente o histórico.
8. Clique em **Desconectar**. Verifique no PBX se o ramal foi desregistrado.

Nenhum teste real de telefonia foi executado nesta implementação, porque não há servidor SIP e credenciais de teste fornecidos ao ambiente.

## Limitações deliberadas

- O piloto é **local**. No Vercel, a política de segurança (CSP `connect-src`) do CRM impede conexões WSS arbitrárias; não relaxamos essa política globalmente.
- É um piloto **separado do Calling Workspace**. O histórico, a duração, os resultados comerciais e os eventos ainda não são sincronizados automaticamente com o CRM.
- O SIP.js usa a classe SimpleUser, própria para **uma chamada simultânea**. Discagem preditiva, filas, múltiplas chamadas, transferência, gravação e administração de PBX ficam para etapas posteriores.
- A compatibilidade do servidor, codecs, NAT/ICE, TURN, certificados TLS e configurações de ramais precisam ser testados no ambiente real.
- Os controles `sip` e `browser_webrtc` existentes no CRM permanecem indisponíveis como providers padrão, pois ainda não estão ligados ao motor de telefonia.
- Não há reprodução de código do Browser Phone (AGPL), somente referência arquitetural. SIP.js MIT permanece atribuído à sua distribuição.

## Próxima etapa, após testes do piloto

1. Hospedar uma dependência SIP.js instalada/empacotada localmente com lockfile e testes de build; remover dependência externa de CDN.
2. Criar adaptador real de ciclo de vida SIP em `src/services/voice-dialer.ts`, com transporte WebSocket, contexto de lead, estados versionados e comandos de voz.
3. Mapear os eventos SIP reais ao `realtalent.voice.event.v1` e ao `Call Runtime`, com reconciliação de quedas e idempotência.
4. Integrar um formulário de conexão SIP seguro e separado por workspace, sem gravar senha no browser storage; para produção, avaliar credenciais de curta duração ou armazenamento protegido no backend.
5. Escolher e configurar central de telefonia: **MikoPBX/Asterisk** para simplicidade operacional, ou Wazo se for necessário controle por APIs. Executar QA de mídia, TLS, CORS/CSP, PBX e LGPD.
6. Só então ativar o provider SIP como opção de chamadas reais no CRM; produzir preview e revisar antes de production.

## Fontes técnicas

- SIP.js: https://github.com/onsip/SIP.js (MIT)
- Guia Web.SimpleUser: https://github.com/onsip/SIP.js/blob/main/docs/simple-user.md
- Browser Phone (referência, sem cópia de código): https://github.com/InnovateAsterisk/Browser-Phone
- MikoPBX: https://github.com/mikopbx
