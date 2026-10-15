# RealTalent Agent Runtime V0.5 — Unified Agent Core

## Adicionado
- um único prompt principal e identidade `RealTalent Agent`;
- roteamento interno ASK / ANALYZE / ACT / BUILD / QA;
- Tool Registry central;
- `system.run_builder` e `system.run_qa` compartilhadas;
- memória persistente compartilhada CRM + Blue Ocean;
- redaction recursiva de padrões de API key/token/senha, inclusive eventos de Builder/QA e memória legada carregada;
- `/memory` e `/memory/reset`;
- Builder assíncrono `/builder/run` + `/builder/jobs/:id`;
- registro seguro de workspaces em `~/.config/realtalent-agent/workspaces.json`;
- eventos de Builder e QA realimentam a memória operacional.

## Preservado
- 6 tools comerciais do CRM;
- 7 tools do Blue Ocean;
- confirmação antes de escrita;
- Browser QA em Chromium gerenciado e loopback;
- Builder limitado a arquivos existentes em `src/`, com backup/gates/rollback.

## Limites
A memória não é banco de dados e não deve ser usada como verdade atual para IDs. Build/typecheck completos dependem de `node_modules` instalados no workspace.
