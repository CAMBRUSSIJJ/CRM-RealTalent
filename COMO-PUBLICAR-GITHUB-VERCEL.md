# Publicação — RealTalent CRM V100.42

1. Execute `npm ci` e `npm run homologate`.
2. Envie a alteração por branch e Pull Request.
3. Configure os GitHub Environments `staging` e `production`.
4. Execute **Publicar e homologar staging V100.42**.
5. Confirme os relatórios E2E e de isolamento multiempresa.
6. Promova somente pelo workflow protegido **Promover V100.42 para produção**.

O Vercel publica o build Vite. O HTML standalone é apenas um artefato derivado da mesma fonte TypeScript.
