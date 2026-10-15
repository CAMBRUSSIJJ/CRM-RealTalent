# V101.11.1-H2 — Cinematic Login & Brand Motion

## Escopo
Hotfix exclusivamente visual da entrada/autenticação sobre a H1. Não altera dados, schema, integrações ou lógica de sessão/logout.

## Adicionado
- Fundo full-screen azul/teal com auroras, mesh e ondas discretas.
- Animação da própria logo RT com reveal central, ecos de profundidade, scan luminoso, pulse e órbitas secundárias.
- Mesma linguagem visual aplicada ao splash de inicialização.

## Preservado
- Login Gate local antes do workspace.
- Login real via Supabase.
- Sair da conta sem apagar dados.
- `prefers-reduced-motion`.

## Segurança
Nenhuma mudança no modelo de autenticação. Esta release é visual e de motion design.

## QA resumido
- V101.11.1: 34/34
- H1 Login Gate & Logout: 35/35
- H2 Cinematic Login & Brand Motion: 38/38
- qa:architecture: PASS
- check:legacy: PASS
- Linux preflight: 356 TS/TSX PASS
- CSS: 73 arquivos + bundle final, 0 erros de parsing
