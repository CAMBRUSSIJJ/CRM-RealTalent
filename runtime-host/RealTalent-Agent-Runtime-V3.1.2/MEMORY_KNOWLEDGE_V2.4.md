# RealTalent Agent V2.4 — Memory & Knowledge Intelligence

## Objetivo

A V2.4 evolui o cérebro central da RealTalent Agent sem ampliar funções de negócio do CRM ou do Blue Ocean. O foco é fazer a IA recuperar conhecimento relevante antes de raciocinar, persistir somente memórias duráveis controladas e manter histórico conversacional separado da memória semântica.

## Arquitetura

```text
Entrada do usuário
   │
   ├─ Intent / Reference Resolver / Complexity Classifier (V2.3)
   │
   ├─ Context Engine
   │      ├─ contexto conversacional relevante
   │      ├─ memória semântica explícita
   │      └─ base de conhecimento RAG
   │
   ├─ Hybrid Retriever
   │      ├─ embedding local
   │      ├─ lexical score
   │      ├─ phrase boost
   │      ├─ escopo do produto
   │      └─ recência
   │
   ├─ Reranker
   │
   ├─ Planner / Model Router / Tool-First
   │
   ├─ Verifier / Repair
   │
   └─ Resposta
```

## Memórias separadas

### Conversation Memory
Somente o chat atual. Novo chat continua iniciando com `messages=[]`, `summary=null` e `activeTopic=null`.

### Project Memory
Decisões de projeto já existentes na arquitetura V2.2. Na V2.4, itens persistidos nessa camada também podem receber índice semântico para recuperação direcionada.

### Semantic Memory
Memória durável pesquisável semanticamente. A política é `explicit-only`: mensagens comuns do chat não são automaticamente promovidas a memória durável.

### Operational Memory
Execuções, eventos, QA, Builder, incidentes e demais sinais técnicos. Continua separada das decisões de projeto e da base de conhecimento.

## Base de conhecimento RAG

A base de conhecimento é explicitamente indexada. Cada documento recebe:

- produto/escopo (`crm`, `blue_ocean` ou `global`);
- título e origem;
- chunks com overlap;
- embedding;
- metadados;
- timestamp;
- identificador estável.

A recuperação usa busca híbrida e reranking. Embeddings são tentados via Ollama; se o serviço de embedding estiver indisponível, existe fallback determinístico local para preservar funcionalidade e testes.

## Formatos de conhecimento

O CLI `knowledge-agent.py` aceita diretamente:

- TXT, Markdown;
- JSON/JSONL;
- CSV/TSV;
- JavaScript/TypeScript/JSX/TSX;
- CSS/SCSS/HTML/XML/SQL/Python/Shell/YAML;
- DOCX por extração XML local;
- PDF quando `pdftotext`/`poppler-utils` estiver instalado.

A V2.4 não usa OCR para PDF escaneado.

## CLI

```bash
./realtalent-agent.sh conhecimento status
./realtalent-agent.sh conhecimento list crm
./realtalent-agent.sh conhecimento add crm ./manual-crm.md
./realtalent-agent.sh conhecimento search crm "follow-up vencido"
./realtalent-agent.sh conhecimento remove <document-id>
./realtalent-agent.sh conhecimento reset crm
```

Memória:

```bash
./realtalent-agent.sh memoria status
./realtalent-agent.sh memoria semantica status
./realtalent-agent.sh memoria semantica search crm "decisão de pipeline"
./realtalent-agent.sh memoria semantica add crm decision "Manter filtros do pipeline centralizados"
./realtalent-agent.sh memoria semantica reset crm
./realtalent-agent.sh memoria projeto-reset crm
./realtalent-agent.sh memoria operacional-reset
```

## APIs V2.4

```text
GET    /memory
GET    /memory/semantic/search
POST   /memory/semantic
DELETE /memory/semantic/:id
POST   /memory/semantic/reset

GET    /knowledge/status
GET    /knowledge/documents
GET    /knowledge/search
POST   /knowledge/documents
DELETE /knowledge/documents/:id
POST   /knowledge/reset
```

## Limites conhecidos

A V2.4 usa armazenamento JSON local para vetores. É apropriado para a fase atual e operação local, mas ainda não é um vector database com índice ANN para milhões de chunks. O reranker é determinístico/híbrido, não um cross-encoder treinado. Esses dois pontos são candidatos naturais da V2.5/V2.6 depois que houver volume real de conhecimento e benchmark próprio.
