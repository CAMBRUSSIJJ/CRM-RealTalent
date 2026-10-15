# RealTalent Agent V1.1 — Local AI Runtime

## Objetivo
Remover a dependência obrigatória de `OPENAI_API_KEY` e permitir que a mesma RealTalent Agent rode localmente via Ollama, preservando Governance, Programs, Missions, Workflows, Builder e Browser QA.

## Adicionado
- AI Provider Router único com `ollama`, `openai` e `hybrid`.
- Ollama como opção local sem cobrança por token.
- OpenAI continua opcional.
- Modo híbrido: Ollama primeiro; OpenAI apenas em fallback quando configurada.
- `./instalar-ia-local.sh` para preparar Ollama e baixar o modelo local.
- `./status-ia-local.sh` para verificar provider/modelos.
- `/ai/status` e `/ai/probe` no runtime.
- Aba **IA** no Control Center.
- Modelo local principal configurável por `OLLAMA_MODEL`.
- Modelo de visão opcional por `OLLAMA_VISION_MODEL`.
- Browser QA local com fallback textual seguro quando não existe modelo de visão.
- Self-test de IA Local com Ollama simulado.

## Alterado
- `./configurar-agent.sh` agora pergunta o provider antes de qualquer chave.
- Modo local não solicita OpenAI API key.
- Runtime passa a reportar provider, modelo e status Ollama.
- CRM e Blue Ocean usam branding V1.1 local-first.
- Tela de Settings do CRM passa a apresentar Ollama como provider local-first.
- Mensagem de erro no Blue Ocean deixa de instruir `OPENAI_API_KEY` e orienta a configuração local.
- Limite de contexto do Builder é menor em provider local por padrão para reduzir pressão de RAM/context window.

## Preservado
- Uma única RealTalent Agent.
- Governance V1.0.
- Programs, Missions e Workflows.
- Checkpoints humanos para ACT/Builder.
- Audit log SHA-256.
- Budget/fila/aprovações/snapshots.
- Rollback operacional do Agent.
- Builder transacional e Browser QA.

## Limitações conhecidas
- O modelo local precisa ser baixado separadamente e pode ocupar vários GB.
- Velocidade e qualidade dependem da CPU/GPU/RAM do computador.
- Sem `OLLAMA_VISION_MODEL`, o Browser QA local não recebe a screenshot; usa URL, texto visível, console e rede e deve pedir intervenção se evidência visual for indispensável.
- Os launchers não incluem `node_modules`; typecheck/build completos dos produtos não são marcados como PASS nesta validação.
