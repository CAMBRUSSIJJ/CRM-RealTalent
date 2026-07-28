# Plano de homologação — V100.41

## Gates locais e CI

1. `npm ci`
2. `npm run homologate`
3. auditoria de dependências sem vulnerabilidade alta
4. standalone gerado da mesma fonte TypeScript

## Staging real

1. aplicar todas as migrations em projeto Supabase exclusivo;
2. publicar todas as Edge Functions;
3. publicar o frontend com `VITE_RELEASE_CHANNEL=staging` e commit rastreável;
4. validar `/health.json` e headers de segurança;
5. executar `scripts/e2e_staging.py`;
6. executar `scripts/tenant_isolation_test.py` com duas organizações diferentes;
7. anexar os relatórios ao candidato de release.

## Critérios de reprovação

- erro de console ou página;
- versão/commit divergente no health;
- uma organização visualizar ou alterar registro de outra;
- migration sem RLS ou lock;
- build não reproduzível;
- fila, integração ou Edge Function com erro não tratado.
