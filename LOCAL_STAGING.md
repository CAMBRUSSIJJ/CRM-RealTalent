# RealTalent CRM — Staging local sem custo

Este fluxo cria um ambiente de QA totalmente local para o RealTalent CRM usando Supabase CLI + Docker. Ele não cria projeto nem branch hospedado no Supabase, não copia dados reais e não altera Vercel, Railway ou Production.

## Pré-requisitos

- Linux com Docker ativo
- Node.js 18 ou superior
- `npm`/`npx`
- branch `preview/v3.5-h1-semantic-agent`

A Supabase CLI é usada globalmente quando já estiver instalada. Caso contrário, o script executa uma versão pinada via `npx`.

## Execução completa

```bash
git checkout preview/v3.5-h1-semantic-agent
git pull
bash scripts/local-staging.sh all
```

O comando `all` faz, nesta ordem:

1. sobe a stack local do Supabase;
2. aplica todas as migrations versionadas com `supabase db reset`;
3. cria um workspace descartável `RealTalent Local QA`;
4. cria contas locais de Administrador, Gestor e Vendedor;
5. configura os perfis H22 e uma equipe comercial QA;
6. gera os arquivos locais `.env.cr2.local`, `.env.cr3.local` e `.env.staging.local`;
7. executa CR2 (Auth/RLS/perfis);
8. executa CR3 (fluxo comercial E2E).

As credenciais e chaves locais não são versionadas.

## Abrir o CRM usando somente o banco local

Depois que `all` passar:

```bash
bash scripts/local-staging.sh crm
```

O processo carrega `.env.staging.local` e inicia o CRM com `VITE_DATA_MODE=supabase`, apontando para `http://127.0.0.1:54321` (ou a URL local emitida pela CLI).

## Ver URLs locais

```bash
bash scripts/local-staging.sh status
```

O resumo mostra somente URLs locais; chaves são omitidas.

O Supabase Studio normalmente fica em:

```text
http://127.0.0.1:54323
```

## Repetir QA

```bash
bash scripts/local-staging.sh reset
```

Isso recria o banco local a partir das migrations, refaz o bootstrap QA e roda CR2/CR3 novamente.

Para rodar apenas os probes:

```bash
bash scripts/local-staging.sh cr2
bash scripts/local-staging.sh cr3
# ou ambos
bash scripts/local-staging.sh qa
```

## Parar ou apagar o staging local

Preservar os volumes locais:

```bash
bash scripts/local-staging.sh down
```

Apagar os volumes e arquivos QA locais:

```bash
bash scripts/local-staging.sh clean
```

## Proteções contra Production

O bootstrap valida a URL antes de usar privilégios administrativos e recusa qualquer hostname diferente de `127.0.0.1`, `localhost` ou `::1`. Portanto, variáveis de um Supabase hospedado não são aceitas por esse fluxo.

Também são ignorados pelo Git:

- `.supabase-local-status.env`
- `.env.cr2.local`
- `.env.cr3.local`
- `.env.staging.local`

O CR3 usa endereços sintéticos e registra a comunicação diretamente no banco de staging; ele não dispara uma mensagem real de WhatsApp ou e-mail.

## Escopo dos gates

### CR2

Valida login e autorização real de:

- Administrador;
- Gestor;
- Vendedor;
- escopo `all/team/own`;
- aprovação de propostas;
- acesso a configurações.

### CR3

Valida o fluxo:

`login → contato → lead → oportunidade → follow-up → tarefa → comunicação → proposta → aceite → fechamento → receita`

Inclui teste negativo para impedir que o Vendedor reconheça receita quando o perfil não permite.

## Regra operacional

O staging local existe para testes destrutivos e repetíveis. Nunca substituir a URL local por uma URL `*.supabase.co` nos arquivos gerados por este fluxo.
