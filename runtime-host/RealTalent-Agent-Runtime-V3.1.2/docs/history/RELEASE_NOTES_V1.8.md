# RealTalent Agent V1.8 — Deep Visual & Browser Intelligence

## Objetivo
Elevar o Browser QA de screenshot + texto para uma camada de evidência visual/estrutural reproduzível, mantendo o modelo local leve e sem exigir `OLLAMA_VISION_MODEL`.

## Adicionado
- DOM/CSS diagnostics com bounding boxes e estilos calculados.
- árvore de acessibilidade via Chromium CDP (`Accessibility.getFullAXTree`).
- detecção determinística de overflow horizontal, texto/controle cortado, alvos pequenos, controles sem nome, contraste insuficiente, IDs duplicados e sobreposição entre controles.
- coleta de console, request failures e respostas HTTP 4xx/5xx do app local.
- screenshot JPEG para o modelo e PNG para evidência/diff.
- pixel diff Antes × Depois com percentual de pixels alterados e bounding box da mudança.
- score estrutural por severidade; não é tratado como nota estética nem prova isolada de qualidade.
- `evidence-manifest.json` com SHA-256 dos artefatos e `report.json` por execução.
- endpoint `GET /qa/jobs/:id/visual`.
- comparação Antes × Depois enriquecida no chat.
- Deep Visual QA no modo técnico.
- self-test visual determinístico.

## Segurança
- navegação continua limitada a HTTP loopback.
- `observe` continua sem escrita.
- credenciais/segredos continuam bloqueados.
- sem modelo visual local, a Agent não alega interpretar pixels; usa DOM/CSS/AX/texto/console/rede e pede usuário quando pixels forem indispensáveis.
- pixel diff prova mudança visual, não melhora.

## Compatibilidade
Preserva Conversation Intelligence, Project Brain, Builder Sandbox, Browser QA semântico, Workflow, Mission, Program e Production Governance.
