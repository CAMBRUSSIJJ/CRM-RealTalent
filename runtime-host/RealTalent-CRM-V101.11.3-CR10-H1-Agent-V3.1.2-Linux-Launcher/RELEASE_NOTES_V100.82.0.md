# RealTalent CRM V100.82.0 — Roteiro Comercial 2.0

## Objetivo
Transformar Playbooks de uma biblioteca de conteúdo em um workspace de execução comercial para ligações e reuniões.

## Entregas
- visão **Executar** com seleção de roteiro ativo;
- modos Passo a passo, Checklist, Ligação e Reunião;
- segmentação por segmento e persona;
- perguntas de discovery, objeções prioritárias e agenda de reunião;
- contexto comercial continua combinando estágio, objetivo, temperatura, resultado e papel decisório;
- checklist persistente no navegador por workspace/roteiro;
- biblioteca mostra modos disponíveis e contexto de targeting;
- sem alteração de schema: novos campos ficam no JSONB `playbooks.guidance`.

## Compatibilidade
Playbooks antigos continuam válidos. Quando não possuem `executionModes`, o CRM escolhe um modo padrão seguro a partir do tipo do playbook.

## Banco
Nenhuma migration nova. `BACKUP_SCHEMA_VERSION` permanece em `100.54`.
