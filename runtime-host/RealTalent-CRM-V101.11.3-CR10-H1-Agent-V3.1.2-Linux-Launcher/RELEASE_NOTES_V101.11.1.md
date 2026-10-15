# V101.11.1 — Login Experience & Reliability

## Objetivo

Tornar a entrada do RealTalent CRM previsível e consistente, corrigindo o estado em que a restauração da sessão Supabase podia ficar presa e criando uma experiência de inicialização/login alinhada à identidade RealTalent.

## Adicionado

- Splash animado RealTalent exibido em toda inicialização normal do CRM.
- Logo RT existente como asset oficial de autenticação (`public/realtalent-logo.png`).
- Componente reutilizável `RealTalentBrandMark` com entrada, halo, órbita e brilho discretos.
- Nova camada `login-experience.css`, isolada das superfícies operacionais do CRM e carregada ao fim do cascade.
- Paleta de autenticação RealTalent: `#04342C`, `#1D9E75`, `#F1EFE8`, `#2C2C2A`.
- Suporte a `prefers-reduced-motion` e responsividade para desktop/mobile.

## Corrigido

- `auth.getSession()` agora possui timeout de 6 segundos.
- Falha/rejeição na restauração da sessão não mantém mais o CRM preso em `authLoading`.
- Quando a sessão Supabase não pode ser restaurada, o sistema cai de forma segura para a tela de login.
- Uma resposta atrasada de `getSession()` não pode sobrescrever um evento de autenticação já resolvido.
- Evento tardio de `PASSWORD_RECOVERY` agora sincroniza corretamente o modo de recuperação da tela.

## Comportamento da entrada

- **Supabase com sessão válida:** animação RealTalent → CRM.
- **Supabase sem sessão / sessão inválida:** animação RealTalent → login real.
- **Supabase com falha/travamento na restauração:** timeout seguro → login real.
- **Modo local:** animação RealTalent → workspace local, sem fingir autenticação remota.
- **Buyer Room público:** continua bypassando a entrada privada do CRM.

## Preservado

- V101.11.0 Communications Architecture.
- 49 migrations e schema existentes.
- Dados, repositories, regras comerciais e integrações.
- App Shell e módulos operacionais não foram redesenhados nesta versão.

## QA

- `qa:architecture`: PASS.
- `qa:v101.11.1`: 34/34.
- `qa:v101.11.0`: 44/44.
- Release Manifest: 60/60.
- `check:legacy`: PASS.
- Build registry-independent: 280 módulos.
- CSS-fonte e bundle: 0 erros de parsing.

Os gates oficiais TypeScript/Vitest/Vite não foram marcados como PASS neste sandbox porque a árvore real de `node_modules` não está disponível e o registry npm não respondeu.
