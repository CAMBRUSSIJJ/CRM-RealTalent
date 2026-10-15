# RealTalent CRM V101.10.7-H1 — Lockfile Recovery

Hotfix operacional sobre a V101.10.7. Não altera UX, CRM, Gateway, Connect ou regras de negócio.

## Problema corrigido

O `package.json` da V101.10.7 passou a declarar dependências de runtime de WhatsApp/Connect, mas o `package-lock.json` empacotado não continha toda a árvore correspondente. Por isso `npm ci` encerrava com `EUSAGE` e mensagens `Missing: ... from lock file`.

## Correção

- novo `scripts/lockfile-integrity.mjs` valida o lockfile antes de `npm ci`;
- se o lock estiver incompleto, `start-linux.sh` executa `npm install` uma única vez para reconstruir o lock e instalar a árvore;
- depois da recuperação, o launcher grava o hash do lock e volta a usar `npm ci` como caminho determinístico;
- se `npm ci` detectar EUSAGE/mismatch posteriormente, o recovery é acionado automaticamente;
- as dependências críticas `@whiskeysockets/baileys`, `qrcode` e `whatsapp-web.js` são verificadas depois da instalação;
- `--verify` e `--rebuild` preservados.

## Importante

Esta hotfix é autocorretiva porque o ambiente de build que gerou o pacote não conseguiu acessar o registry npm para regenerar previamente toda a árvore transitiva. Na primeira execução em uma máquina com acesso ao registry, o lockfile é reconstruído localmente; nas execuções seguintes, o fluxo retorna a `npm ci`.

## Uso

```bash
chmod +x start-linux.sh
./start-linux.sh
```

Para auditoria completa depois da primeira inicialização:

```bash
./start-linux.sh --verify
```
