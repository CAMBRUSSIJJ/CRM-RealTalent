# V101.11.3-CR1 — Commercial Readiness: Build & Dependency Closure

Base: **V101.11.3-H22.3-H1**.

## Objetivo

Iniciar a macrofase de prontidão comercial removendo do build principal a dívida que fazia o CRM inteiro depender das bibliotecas pesadas do WhatsApp QR para conseguir instalar, tipar, testar e compilar.

## O que mudou

### Lockfile principal recuperado

O `package.json` principal agora contém apenas dependências do núcleo do CRM. O `package-lock.json` volta a passar em `scripts/lockfile-integrity.mjs` sem reconstrução automática.

### Runtime de Comunicação isolado

As dependências abaixo foram movidas para `runtime/communications/package.json`:

- `@whiskeysockets/baileys@7.0.0-rc14`
- `qrcode@1.5.4`
- `whatsapp-web.js@1.34.7`

O launcher instala esse runtime apenas quando necessário. O build do CRM deixa de depender dessas bibliotecas.

### Lazy loading preservado

`whatsapp-qr-bridge.mjs`, `whatsapp-browser-qr-bridge.mjs` e o hotfix de mídia passam a resolver os pacotes pelo runtime isolado. O Gateway continua podendo subir em modo degradado sem carregar o motor QR no boot.

### Doctor melhorado

Agora diferencia:

- `Lockfile`
- `Dependências core`
- `Runtime Comunicação`

Isso torna diagnóstico de instalação mais preciso.

## Validação

- `qa:architecture`: PASS
- CR1: **16/16 PASS**
- Source Syntax: **421 arquivos PASS**
- Integration Contracts: **389 arquivos PASS**
- Migrations: **58/58 PASS**
- Release Manifest: **109/109 PASS**
- Capability Matrix: **49 capacidades / 188 evidências / 127 executáveis**
- Build independente: **306 módulos PASS**

## Limitação do ambiente

O registry npm não concluiu a instalação nesta sessão. Portanto `npm ci`, TypeScript oficial, Vitest e Vite continuam **BLOCKED**, não PASS.

A diferença em relação à H22.3-H1 é que o bloqueio já não é causado por um `package-lock.json` estruturalmente inválido: o lock principal está sincronizado. Falta agora apenas a prova de instalação/download em ambiente com acesso normal ao registry e, depois, fechar o lock transitivo isolado do runtime de Comunicação.
