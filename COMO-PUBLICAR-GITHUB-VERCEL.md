# GitHub e Vercel

## GitHub

No Windows, execute `PREPARAR-GITHUB.bat`. O repositório deve ser privado, sem licença e sem arquivos `.env`.

Pelo terminal:

```bash
git init
git branch -M main
git add .
git commit -m "RealTalent CRM V100.27"
gh repo create realtalent-crm --private --source=. --remote=origin --push
```

## Vercel

1. importe o repositório;
2. selecione Vite;
3. use `npm run build` e saída `dist`;
4. configure Node 22;
5. cadastre as variáveis de `.env.production.example`;
6. publique;
7. adicione o domínio nas URLs do Supabase Auth;
8. abra `/health.json` para confirmar a versão.
