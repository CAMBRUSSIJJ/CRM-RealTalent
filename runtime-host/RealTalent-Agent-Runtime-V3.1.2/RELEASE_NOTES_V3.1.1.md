# Release Notes — V3.1.1

## Adicionado

- Model Calibration Arena para Ollama local.
- Dataset de calibração para `GENERAL`, `REASONING`, `CODER` e `VISION`.
- Métricas de qualidade, latência, tokens/s, carga e memória aproximada.
- Seleção derivada do papel `FAST`.
- Avaliação humana A/B para os dois melhores modelos gerais.
- Aplicação segura com backup do `agent.env`.
- Proveniência da calibração em `model-calibration.json`.
- Comando `./realtalent-agent.sh calibrar ...`.
- Fluxo único `./realtalent-agent.sh calibrar completo`.
- Setup passa a usar calibração aplicada como padrão quando disponível.

## Melhorado

- Identificação do setup/installer para V3.1.1.
- A qualidade tem peso dominante na recomendação (90%).
- Nenhum download automático de modelos durante a arena.
- Nenhuma troca silenciosa de configuração.

## Preservado

- Intelligence Quality V3.1.
- API/kernel V3.1 e contrato V3.0.
- Scroll fixes V3.0.1/V3.0.2.
- Memory/RAG, Vision, Learning, Reasoning, Execution e Long-Horizon.
- Integrações CRM e Blue Ocean V3.1.

## Não incluído

- CRM Native Tools Read-Only ainda não foi iniciado nesta patch.
- Fine-tuning/LoRA não foi adicionado.
- A arena não baixa candidatos automaticamente.
