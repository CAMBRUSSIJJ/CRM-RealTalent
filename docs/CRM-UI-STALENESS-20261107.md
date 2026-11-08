# RealTalent CRM — Diagnóstico de interface antiga (07/11/2026)

## Causas verificadas no código

1. O inicializador `scripts/start.mjs` decidia reutilizar `dist` apenas verificando textos históricos em `dist/index.html`. Esses textos continuam presentes quando `src` muda, então `./start-linux.sh` podia servir uma UI antiga mesmo com arquivos TSX/CSS novos.
2. `CommunicationsPage` consultava `sessionStorage['realtalent.communications.transport.v101']`. Se o valor fosse `original`, mantinha a interface legada mesmo com WAHA disponível. O default dependia da flag de build `VITE_WAHA_DIRECT_PREVIEW`.

## Correções na branch do piloto SIP.js

- `scripts/runtime-ui-build-integrity.mjs`: SHA-256 de fontes React, CSS, configuração de build, recursos estáticos e valores VITE relevantes. Comparação com `dist/rt-ui-build.json`.
- `scripts/start.mjs`: antes de abrir o CRM em modo normal, recompila quando `dist` não corresponde às fontes atuais. `--preview-only` recusa o build desatualizado. O navegador abre com `rt_build=<hash>`.
- `CommunicationsPage`: usa `realtalent.communications.transport.v102`; não reutiliza a preferência antiga `original`. Em localhost, a interface **WAHA** é a escolha inicial, com seleção manual da Central original disponível. Em ambientes remotos, WAHA só é default quando habilitado.
- `scripts/diagnose-served-ui.mjs`: compara impressão digital e horário do build na pasta atual com o JSON que a porta local realmente serve.
- `scripts/runtime-ui-build-integrity.test.mjs` e `scripts/communications_current_ui_audit.mjs`: testes da invalidação de build e da preferência de comunicação.

## Instalar na mesma pasta existente (preserva dados locais)

Preferir atualizar **a mesma instalação** para preservar `.env.local`, sessões, chaves e arquivos locais. O ZIP contém o código e não contém `node_modules`, `dist` nem os dados locais anteriores.

```bash
cd ~/Downloads
curl -fL --retry 3 'https://github.com/CAMBRUSSIJJ/CRM-RealTalent/archive/refs/heads/feat/realtalent-connect-sip-pilot-20261107.zip' -o RealTalent-Correcoes-UI.zip
unzip -oq RealTalent-Correcoes-UI.zip -d RealTalent-Flow-Integrado
cd RealTalent-Flow-Integrado/CRM-RealTalent-feat-realtalent-connect-sip-pilot-20261107
npm run qa:ui:runtime
./start-linux.sh
```

Se estiver usando `~/Downloads/CRM-RealTalent-feat-realtalent-connect-sip-pilot-20261107` sem a pasta `RealTalent-Flow-Integrado`, extraia o ZIP diretamente em `~/Downloads` em vez de criar outra instalação.

Após iniciar em um terminal, abra um **segundo terminal**, vá até a mesma pasta e execute:

```bash
npm run diagnose:ui
```

A saída deve mostrar:

```text
Arquivos de interface compilados nesta instalação: ATUALIZADOS
CRM no navegador (porta 4188): ESTA instalação e build
Interface Comunicações: waha-default-local-v102
Interface Ligações: realtalent-flow-v20261107
OK: o navegador está recebendo exatamente o build atualizado.
```

Esse arquivo JSON descreve **capacidade do build**, não qual das duas interfaces foi selecionada em cada aba. Na tela de Comunicações, a opção WAHA é selecionada por padrão em localhost; o atributo DOM `data-realtalent-communications-ui` mostra a escolha atual.

## Limites

- Nenhum processo do computador do usuário foi inspecionado ou encerrado remotamente.
- O helper detecta atualizações de código e divergência do servidor local, mas não garante que WAHA esteja conectado na porta local ou que haja sessão WhatsApp autenticada.
- `npm run qa:ui:runtime` e os testes existentes não substituem testes visuais e de chamadas/mensagens no navegador.
- Não ativar production até revisão no ambiente local.
