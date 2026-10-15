# RealTalent CRM V101.10.2-H2 — Prospecting Agent CSS Build Hotfix

## Correção
O CSS adicionado na H1 foi gravado com sequências literais `\n` em vez de quebras de linha reais. O Lightning CSS do Vite interrompia o build em `prospecting-agent-v101102.css`.

## H2
- converte os escapes inválidos para newlines reais;
- mantém o layout e o fluxo do Prospecting Agent H1;
- mantém o Agent Linux, OpenStreetMap/Overpass, crawler, fila, scheduler e integração com o CRM;
- adiciona QA específico para detectar `\n` literal no CSS antes de uma nova release.

Não há migration nova.
