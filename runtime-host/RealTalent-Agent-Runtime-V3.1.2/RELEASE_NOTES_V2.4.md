# Release Notes — RealTalent Agent V2.4

## Memory & Knowledge Intelligence

A V2.4 mantém intacta a direção da V2.3 Intelligence Core e adiciona uma camada central de memória semântica e recuperação de conhecimento.

### Adicionado

- embeddings locais via Ollama;
- fallback determinístico de embeddings quando Ollama de embeddings não estiver acessível;
- memória semântica persistente e pesquisável;
- política de memória durável `explicit-only`;
- RAG local por produto (`crm`, `blue_ocean`, `global`);
- chunking com overlap;
- busca híbrida semântica + lexical + phrase boost + escopo + recência;
- reranking antes de injetar contexto no modelo;
- Knowledge API;
- Semantic Memory API;
- CLI de conhecimento;
- CLI de memória semântica;
- Control Center com memória semântica e base de conhecimento separadas;
- perfil de hardware com papel específico de modelo de embedding;
- suporte de ingestão a texto/código/CSV/JSON/DOCX e PDF textual com `pdftotext`.

### Melhorado

- Project Memory pode participar da recuperação semântica;
- Context Engine recebe somente evidências recuperadas relevantes;
- prompts tratam memória recuperada como contexto, nunca como verdade absoluta;
- evidência atual de ferramentas/App Context continua tendo prioridade sobre memória antiga;
- reset de conhecimento, memória semântica, memória de projeto e memória operacional são operações distintas;
- setup Linux configura modelo de embedding separadamente.

### Preservado

- Intelligence Core V2.3;
- Model Router / Complexity Classifier;
- Reference Resolver;
- Verifier / Repair;
- Tool-First server-side;
- App Context Bridge;
- histórico com renomear/arquivar/excluir;
- hard reset de Novo Chat;
- CRM e Blue Ocean usando um único cérebro central.

### Não adicionado nesta release

A V2.4 não adiciona novas funções de CRM ou Blue Ocean. O objetivo deliberado desta release é melhorar a inteligência central antes de ampliar superfícies de produto.

### Limitações

- vector store ainda é JSON local, sem ANN/vector DB dedicado;
- reranker ainda é híbrido determinístico, não um cross-encoder dedicado;
- OCR de PDF escaneado não faz parte da V2.4;
- Browser Conversation E2E não pôde ser atestado neste ambiente porque o Chromium é administrativamente configurado com `URLBlocklist=["*"]`, resultando em `ERR_BLOCKED_BY_ADMINISTRATOR` para `localhost`;
- builds completos dos dois aplicativos continuam dependendo de instalação de dependências no ambiente de destino e não são declarados PASS apenas por auditoria estrutural.
