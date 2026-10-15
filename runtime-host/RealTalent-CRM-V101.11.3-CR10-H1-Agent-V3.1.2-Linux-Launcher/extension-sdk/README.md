# RealTalent Extension SDK — V100.40

Adaptador para registrar extensões Chrome no CRM e enviar lotes com identidade da instalação, versão, origem e idempotência.

## Fluxo

1. A extensão autentica o usuário no Supabase.
2. `register()` vincula navegador, usuário e organização.
3. O CRM devolve configuração remota e versão mínima.
4. `sendBatch()` envia o lote ao `extension-ingest`.
5. A Central de Extensões mostra instalação, fila, eventos e erros.
6. `heartbeat()` atualiza fila local, último sinal e configuração.

## Armazenamento recomendado

- Gere `installationKey` uma vez com `crypto.randomUUID()`.
- Salve-o em `chrome.storage.local`.
- Não use a chave administrativa do Supabase.
- O token de ingestão deve ser restrito à organização e revogável no CRM.

## Cabeçalhos enviados

- `x-rt-installation-id`
- `x-rt-product-key`
- `x-rt-extension-version`
- `x-rt-connection-name`
- `x-rt-browser`
- `x-rt-browser-version`
- `x-rt-platform`
- `x-rt-manifest-version`
- `x-batch-id`
- `x-rt-source`
- `x-rt-source-url`
