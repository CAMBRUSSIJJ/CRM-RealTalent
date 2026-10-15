# RealTalent Agent V0.2 — Agent Tools

## Adicionado

- 6 tools reais para o RealTalent CRM.
- 7 tools reais para o Blue Ocean Service Studio.
- Contexto estruturado mais rico para o modelo.
- Revalidação de IDs e relações antes das mutações.
- Criação de propostas limitada ao catálogo e com cálculo feito pelo CRM.
- Evidências vinculadas a etapas e experimentos com relações existentes no Blue Ocean.
- Health do runtime reporta versão, modelo e quantidade de tools por produto.

## Preservado

- Gateway somente em loopback por padrão.
- `OPENAI_API_KEY` fora dos bundles frontend.
- Uma ação proposta por vez.
- Confirmação humana antes de qualquer escrita.
- Ausência de tools destrutivas.

## QA executado

- Runtime Agent audit: 18/18.
- CRM Agent V0.2 audit: 25/25.
- Blue Ocean Agent V0.2 audit: 21/21.
- Blue Ocean baseline H7.24 smoke: 40/40.
- Gateway HTTP: health OK; produto inválido 400; execução sem chave 503.
- Sintaxe das fontes TS/TSX modificadas validada por transpileModule.

## Limitação de validação

O `npm ci` completo de CRM e Blue Ocean não concluiu neste ambiente: os processos permaneceram sem progresso na resolução/obtenção das dependências. Por isso, typecheck integral e production build não são declarados como aprovados nesta entrega. Os ZIPs são gerados sem `node_modules`.
