# RealTalent CRM V100.46.5

Release da **Central de Ligações Profissional**, integrada ao RealTalent Connect e com visualização configurável pelo usuário.

## Entregas principais

- preparação da sessão com fila, meta, ordenação, roteiro e dispositivo;
- integração CRM → RealTalent Connect com fila persistida, estados e fallback telefônico;
- execução em três áreas: fila, roteiro central e painel de apoio;
- wrap-up progressivo exibido somente após encerrar a tentativa;
- resultado obrigatório, próxima ação e comando **Salvar e próximo**;
- escolha do que exibir na página e durante a sessão;
- correção do erro `duplicateIds is not defined` na aba Leads;
- auditoria semântica para impedir identificadores não declarados;
- Central de Comunicações mantida fora da interface;
- build independente do registro npm para publicação no Vercel.

## Validação

```bash
node scripts/source_syntax_audit.mjs
node scripts/runtime_identifier_audit.mjs
node scripts/test-registry-independent.mjs
node scripts/render_stability_audit.mjs
node scripts/build-registry-independent.mjs
```

## Publicação

Copie o conteúdo desta pasta para a raiz do repositório. O `vercel.json` gera `dist/` sem executar `npm install` no deployment.

Leia `docs/CENTRAL-DE-LIGACOES-V100-46-5.md` e `docs/REALTALENT-CONNECT-V100-46-5.md`.
