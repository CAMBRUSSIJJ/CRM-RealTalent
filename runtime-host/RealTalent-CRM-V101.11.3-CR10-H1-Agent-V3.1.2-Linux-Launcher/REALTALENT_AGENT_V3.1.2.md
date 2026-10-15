# RealTalent Agent V3.1.2 — CRM Native Tools Read Only V1

Contrato de plataforma: `realtalent-app-adapter-v3`.

## Escopo V1
- Contatos: search/get
- Oportunidades/Pipeline: search/get/summary/list
- Tarefas: search/get
- Follow-ups: search
- Meu Dia: leitura agregada
- Agenda: leitura de apoio ao Meu Dia

## Segurança
- `mode = read-only`
- `zeroMutation = true`
- `maxSilentWrites = 0` preservado
- O CRM filtra registros por TeamAccess antes do App Context.
- Campos sensíveis (telefone, e-mail e valor do negócio) respeitam FieldAccess.
- O gateway valida novamente os escopos da identidade.
- Meu Dia exige leitura de Contatos + Pipeline + Tarefas.
- Escritas continuam no protocolo Execution Intelligence V2.8 com confirmação.

## Grounding
Fonte canônica: `app-context-authorized-snapshot`. Consultas compatíveis são Tool-First e não dependem do modelo para inventar dados do CRM.

A V3.1 Intelligence Quality e a V3.1.1 Model Calibration permanecem preservadas.
