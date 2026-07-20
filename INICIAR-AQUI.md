# RealTalent CRM V100.27 — iniciar aqui

## Teste rápido no Windows

Dê dois cliques em `INICIAR-CRM-LOCAL.bat`.

Esse modo serve para demonstração e validação da interface. Os dados ficam apenas no navegador usado.

## Desenvolvimento completo no computador

1. Instale Node.js 22 e Docker Desktop.
2. Abra o Docker Desktop.
3. Dê dois cliques em `INICIAR-CRM-COM-SUPABASE.bat`.
4. Cadastre um usuário.
5. Crie o primeiro workspace pela tela inicial.

O script sobe o Supabase local, aplica as migrations, gera `.env.supabase-local` e inicia o frontend.

## Produção

A ordem segura é:

1. GitHub privado.
2. Supabase de staging.
3. testes de permissões e dados.
4. Supabase de produção.
5. Vercel.
6. configuração do agendador de automações.
7. piloto com poucos usuários.

Use `PREPARAR-GITHUB.bat` para criar o repositório Git local. O script não adiciona licença e não inclui arquivos de ambiente.

Para o backend remoto, configure no terminal:

```powershell
$env:SUPABASE_ACCESS_TOKEN="SEU_TOKEN"
$env:SUPABASE_DB_PASSWORD="SENHA_DO_BANCO"
$env:AUTOMATION_CRON_SECRET="SEGREDO_LONGO"
.\PUBLICAR-SUPABASE.bat
```

Depois importe o repositório na Vercel e cadastre as variáveis mostradas em `.env.production.example`.

## Verificação final

- abra `/health.json` no domínio publicado;
- crie uma conta e um workspace;
- confira Configurações → Diagnóstico;
- valide owner, admin, member e viewer;
- teste Leads, Pipeline, Follow-ups, Ligações e Agenda;
- teste a Extensão RealTalent com um lote pequeno;
- deixe automações em simulação antes de ativar o modo real.
