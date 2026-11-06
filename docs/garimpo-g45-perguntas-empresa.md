# G4.5 — Pergunte à IA sobre uma empresa

**Status:** PR #78, prévia local. Production e Supabase de Production não foram alterados.

## Onde encontrar

Garimpo → Revisar → Guiada → selecione uma empresa →
**Pergunte à IA sobre esta empresa**.

Perguntas de exemplo:
- `Mostre o Instagram público desta empresa e as publicações que encontrar.`
- `Qual o CNPJ e a razão social? Verifique o cadastro.`
- `Quais serviços aparecem nas fontes públicas?`

## Como funciona

O Agent local em `127.0.0.1:8791` expõe `POST /tools/company-ask`.
É uma consulta **somente leitura**, que envia ao mecanismo de busca do
Garimpo (porta `4319`) **apenas nome comercial e cidade**, com um foco
de pesquisa `instagram`, `cnpj` ou `general`.

Instagram:
- Descobre referências públicas indexadas, apresenta perfil provável
  e links das publicações localizadas.
- Snippets são identificados como resultados de busca, e **não como
  páginas lidas na íntegra**.
- Não lê todo o histórico de posts, fotos, Stories, comentários ou
  seguidores. Esse acesso exige integrações e permissões previstas pela Meta.
- Não utiliza sessão/logins do usuário, não contorna bloqueios e não
  atribui automaticamente perfis ambíguos.

CNPJ:
- Pesquisa referências públicas do número e também usa um CNPJ já informado
  pelo cadastro, quando válido.
- Valida o dígito verificador de CNPJs numéricos e consulta a BrasilAPI
  por número. A BrasilAPI não oferece busca universal por nome empresarial.
- Exibe razão social, nome fantasia, município, situação e CNAE principal,
  quando disponíveis.
- Indica vínculo `compatível`, `possível` ou `não confirmado`.
  Um registro público **não prova por si só** a identidade da empresa.
- Não altera automaticamente o cadastro no CRM, o Supabase ou o Pipeline.

Demais perguntas:
- O Qwen3 8B interpreta trechos indexados com citações [1], [2] etc.
- Em ausência de fontes, retorna limitação expressa em vez de inventar fatos.

## Diagnóstico no Linux

```bash
curl -fsS http://127.0.0.1:4319/api/prospecting-agent/health
curl -fsS http://127.0.0.1:8791/tools/company-ask/status
```

A resposta esperada identifica `g45-company-focus-v1` no motor e
`company-assistant-g45` no Agent local.

O inicializador da prévia verifica essas versões e substitui somente
processos antigos reconhecidos no mesmo checkout, preservando WAHA e
o histórico do Garimpo. Não encerre uma pesquisa em andamento.

## Testes

```bash
node --test runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-company-assistant-g45.test.mjs
npm run typecheck
npm run build
```
