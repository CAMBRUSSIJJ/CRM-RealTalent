# RealTalent CRM V101.8.1 — RealTalent Connect Setup & Reliability

Esta release corrige o fluxo de configuração do RealTalent Connect e transforma o MVP da V101.8.0 em um setup verificável de ponta a ponta.

## Correções principais

- CORS aplicado também às APIs `/api/phone/v1/*` consumidas pelo CRM em `127.0.0.1:4188`.
- Estado do Connect separado em **Bridge offline**, **Bridge ativo / celular pendente** e **Canal pronto**.
- Diagnóstico explícito de bridge, pareamento, WebSocket, LAN, celular e discador.
- Descoberta de rede prioriza Wi‑Fi/Ethernet e ignora interfaces virtuais como Docker, veth, virbr, Tailscale, tun/tap e WireGuard.
- Interface permite escolher o IP LAN que será usado pelo QR e pelo endereço do RealTalent Phone.
- Um único celular online é selecionado automaticamente como RealTalent Phone padrão.
- Chamada de teste disponível dentro do setup antes de salvar.
- Tela principal de Ligações prioriza o RealTalent Connect; SIP, Browser Voice e outras opções ficam em Telefonia avançada.
- Launcher imprime redes detectadas, diagnóstico do Connect e confirmação de que a porta TCP 3001 está em escuta quando possível.

## Segurança

O CORS continua restrito às origens locais permitidas do CRM. O companion móvel continua usando token por dispositivo, pareamento temporário por workspace e revogação explícita.

## Critério de aceite

O fluxo esperado é: CRM Linux → bridge :3001 → QR/código → celular pareado → aparelho online → chamada de teste → solicitação recebida no RealTalent Phone → discador nativo.
