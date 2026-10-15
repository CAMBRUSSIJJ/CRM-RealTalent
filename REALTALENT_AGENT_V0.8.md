# RealTalent Agent V0.8 — Missions & Recovery (CRM)

A V0.8 mantém a mesma RealTalent Agent e adiciona missões cross-product entre RealTalent CRM e Blue Ocean.

## No CRM

- `system.run_mission` vira um plano `run_mission` revisável.
- O drawer pode iniciar uma missão com o snapshot atual compactado.
- Ao reabrir, uma missão ativa é reanexada antes de um workflow isolado.
- O card de missão mostra blocos, produto, progresso, handoff e replanejamentos.
- Quando o próximo bloco é Blue Ocean, o CRM não inventa contexto: pede abertura do Blue Ocean.
- O workflow filho continua mostrando e executando os checkpoints ACT/Builder existentes.

## Persistência e privacidade

A missão persiste somente metadados, progresso, resumos e IDs de workflows. Snapshots do CRM não são persistidos na missão. O contexto comercial atual é reenviado somente durante o avanço de um bloco CRM.

## Segurança

A missão não escreve dados diretamente. ACT é revalidado e confirmado no CRM. Builder continua com aprovação explícita, backup, gates e rollback. Não foram adicionadas tools de delete, pagamento, sudo, Auth/RLS ou permissões.
