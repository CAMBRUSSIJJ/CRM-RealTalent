# RealTalent Agent V2.3 — Intelligence Core

A V2.3 melhora primeiro a IA central, antes de ampliar a superfície de CRM/Blue Ocean. Ela preserva o Grounded App Intelligence da V2.2 e adiciona uma camada cognitiva adaptativa.

## Implementado

- Complexity Classifier com caminhos **Instant / Standard / Deep**.
- Cognitive Model Router para **Fast / General / Reasoning / Coder / Vision**.
- Context Engine por **relevância + recência**, com hard reset em mudança de assunto.
- Reference Resolver com confiança; referências vagas sem evidência ficam `unresolved`.
- Reasoning Planner de alto nível (sem expor cadeia privada de raciocínio).
- Answer Verifier + um passe de reparo em tarefas deep, Tool-First, perspectiva protegida ou referência ambígua.
- Mesmo Intelligence Core aplicado ao `/chat` e ao `/agent`.
- Roteamento Vision seguro: sem modelo visual configurado, a IA não pode alegar que viu a imagem. Em modo híbrido, Vision pode cair para OpenAI quando configurada.
- Modelos locais são alternados sob demanda para reduzir pressão de RAM. O perfil leve recomenda Qwen3 1.7B (Fast), Qwen3 4B (General/Reasoning), Qwen2.5-Coder 3B (Coder) e Gemma 3 4B como Vision opcional.

## Não implementado nesta versão

RAG vetorial, embeddings, reranker, semantic/project memory vetorial e fine-tuning/LoRA ficam para a próxima camada de Knowledge & Memory. V2.3 não finge que esses componentes já existem.

## Endpoints novos

- `GET /intelligence-core`
- `POST /intelligence-core/classify`

O classificador retorna o nível de complexidade, papel de modelo, estratégia de contexto e necessidade de verificação.
