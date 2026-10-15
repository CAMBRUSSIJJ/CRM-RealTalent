# RealTalent CRM V101.8.4-H6 — Single-Pass Dependency Install

## Correção

- `whatsapp-web.js@1.34.7` passa a ser dependência runtime declarada.
- `@whiskeysockets/baileys`, `qrcode` e `whatsapp-web.js` são instalados na mesma execução de `npm install`.
- removida a segunda instalação `npm install --no-save ...` da H5, que podia quebrar o Arborist do npm com `Cannot read properties of null (reading edgesOut)`.
- se `node_modules` estiver parcial, o launcher remove somente `node_modules` e reconstrói a árvore em uma única etapa.
- política central de dependências passa a aprovar explicitamente `whatsapp-web.js` para o motor Chromium.
