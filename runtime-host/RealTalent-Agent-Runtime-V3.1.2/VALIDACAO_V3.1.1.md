# Validação — RealTalent Agent V3.1.1

## Gates específicos

- V3.1.1 release selftest: **9/9 PASS**
- Model Calibration core: **8/8 PASS**
- Model Calibration Ollama integration (simulado): **8/8 PASS**

## Regressão preservada

- Intelligence Quality V3.1: **11/11 PASS**
- Memory/RAG Quality V3.1: **5/5 PASS**
- Gateway V3.1: **10/10 PASS**
- Platform V3.1: **10/10 PASS**
- Runtime Contract Audit: **290/290 PASS**
- Real-world Quality: **40/40 = 1000/1000 PASS**
- Reliability FULL: **1000/1000 PASS**
- Known-Failure Regression: **10/10 PASS**
- CRM Intelligence Quality integration: **8/8 PASS**
- Blue Ocean Intelligence Quality integration: **8/8 PASS**

## Bateria ampla

- MJS selftests únicos: **46/46 PASS** na repetição final.
- Primeira execução em lote: Project Brain apresentou um falso negativo transitório; executado isoladamente imediatamente depois: **16/16 PASS**; repetição completa: **46/46 PASS**.

## Sintaxe

- Shell scripts: **92/92 PASS**
- Runtime MJS: **76/76 PASS**
- Runtime Python: **4/4 PASS**

## Browser Chat E2E

**UNVERIFIED neste ambiente.** A tentativa real foi bloqueada antes da aplicação por política do Chromium:

`net::ERR_BLOCKED_BY_ADMINISTRATOR` em `http://localhost:<porta>/chat`.

## Calibração de hardware real

**NOT_RUN neste ambiente**, porque a escolha correta depende dos modelos instalados, CPU/GPU/RAM e desempenho do notebook do usuário. O mecanismo foi testado com Ollama simulado; a medição real deve ser executada localmente com `./realtalent-agent.sh calibrar completo`.
