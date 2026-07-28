# Ambientes do RealTalent

## Desenvolvimento

Uso local, dados fictícios e migrations executadas pelo Supabase CLI. Pode operar em modo local do navegador ou Supabase local.

## Homologação

Projeto Supabase exclusivo, domínio próprio de staging e usuários de teste. Toda migration e integração deve ser validada aqui antes da produção.

## Produção

Projeto Supabase exclusivo, secrets próprios, backups e workflows protegidos. Não executar testes destrutivos nem `db reset`.

## Regra de promoção

Código, lockfile, migrations e manifesto precisam ser exatamente os mesmos entre homologação e produção. Apenas variáveis e secrets mudam.
