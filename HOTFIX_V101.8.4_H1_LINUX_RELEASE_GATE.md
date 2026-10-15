# V101.8.4-H1 — Linux Release Gate Fix

Hotfix de empacotamento/QA sobre a V101.8.4 Official Communications.

## Corrigido

- O bridge de Território/Mapa deixou de duplicar a versão literal `101.8.3` e passa a usar `APP_VERSION` como fonte canônica.
- O Linux preflight valida a ligação do bridge à versão canônica em vez de exigir um literal congelado.
- O `<title>` e o README agora identificam a V101.8.4 atual, preservando marcadores históricos do Connect One-Tap.
- O launcher usa `VITE_RELEASE_CHANNEL=official-communications`, preservando o marcador de compatibilidade do Connect.
- Audits históricos foram tornados compatíveis com releases sucessoras: aceitam o canal `official-communications`, migrations posteriores e a V101.8.4 sem perder seus contratos funcionais.
- O limite histórico do arquivo Supabase foi ajustado de 80 KiB para 90 KiB para acomodar a integração oficial de comunicações, mantendo a extração de mappers como requisito.

## Validação neste pacote

- `node scripts/linux-release-preflight.mjs`: OK — 262 arquivos TS/TSX.
- `npm run check`: todos os audits históricos e o audit V101.8.4 passaram até o início do `typecheck`.
- `syntax:audit`: 296 arquivos aprovados.
- `integration:audit`: 264 arquivos aprovados.
- `migrations:verify`: 46 migrations com checksum íntegro.
- `typecheck/build`: não executados neste ambiente porque `node_modules` não está disponível no container de empacotamento. O launcher executa ambos após `npm ci` no Linux.
