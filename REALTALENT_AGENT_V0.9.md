# RealTalent Agent V0.9 — Autonomous Programs no CRM

A V0.9 adiciona Programs acima de Missions e Workflows, mantendo uma única RealTalent Agent.

## Hierarquia

PROGRAM → MISSION → WORKFLOW → TASK

Um Program pode decompor um objetivo amplo em até 8 marcos, com prioridade, dependências e critérios de aceite. Somente uma missão filha fica ativa por Program.

## Segurança e contexto

- o CRM envia contexto compacto e atual a cada avanço;
- snapshots do CRM não são persistidos pelo Program;
- Programs persistem objetivos, estados, dependências, critérios, IDs e resumos sanitizados;
- ações ACT e Builder continuam dependendo dos checkpoints existentes;
- conclusão de uma missão coloca o marco em `awaiting_acceptance`;
- o aceite/rejeição do marco é humano e centralizado no Control Center;
- não foram adicionadas ferramentas `crm.delete_*`.

## Handoff

Um Program pode alternar entre CRM e Blue Ocean. Quando o próximo marco pertence ao Blue Ocean, o drawer informa o handoff e o Blue Ocean retoma o mesmo Program com seu contexto atual.
