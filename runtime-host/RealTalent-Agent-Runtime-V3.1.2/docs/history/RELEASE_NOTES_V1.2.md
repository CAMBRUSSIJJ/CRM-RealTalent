# RealTalent Agent V1.2 — Local Intelligence & Reliability

## Objetivo
Elevar a qualidade da RealTalent Agent local sem aumentar autonomia cega. A V1.2 adiciona roteamento de modelos por tipo de tarefa, perfil automático de hardware, contexto limitado e relevante, Builder isolado, Browser QA orientado a evidências e um benchmark reproduzível.

## Adicionado
- **Model Router**: papéis `fast`, `coder`, `reasoning`, `vision` e `general` no Ollama.
- **Hardware Profiler**: detecta RAM, CPU, GPU e disco; classifica o host como `light`, `balanced` ou `performance`.
- **Context Engine**: compactação por prioridade e limite de contexto para reduzir ruído em modelos locais.
- **AI Telemetry**: provider, modelo, papel, tarefa, latência e volume de contexto sem persistir prompt completo.
- **Objective Console**: um objetivo simples é classificado em Program, Mission, Workflow, Builder ou QA.
- **Builder Sandbox**: aplica alterações primeiro em cópia isolada, executa gates e só promove se a baseline principal não mudou.
- **Auto-Recovery limitado**: até 3 iterações de Builder, sem loop infinito.
- **Browser QA Evidence-Aware**: diagnóstico de overflow, elementos cortados/offscreen/tiny, hash de screenshot e mudança visual.
- **Evaluation Harness**: `intelligence-benchmark.mjs` e `./benchmark-agent.sh`.
- **Hardware CLI**: `./perfil-hardware.sh`.

## Modelo de segurança
A V1.2 não remove os checkpoints existentes. Program/Mission/Workflow, Governance, orçamento, aprovações, fila, snapshots e audit log continuam ativos. Builder trabalha em sandbox e promove somente após validação.

## Limitações
- Modelos locais dependem do hardware e podem ser mais lentos ou menos capazes que modelos de nuvem.
- Visão real de screenshot exige `OLLAMA_VISION_MODEL`; sem ele, QA usa DOM/texto/console/rede e diagnósticos de layout.
- O sandbox do Builder isola arquivos do workspace, mas comandos de gate ainda são processos locais; não é uma VM/container de segurança.
- Os launchers não incluem `node_modules`; typecheck/Vitest/build completos dos produtos não são declarados como PASS quando dependências não estão disponíveis.
