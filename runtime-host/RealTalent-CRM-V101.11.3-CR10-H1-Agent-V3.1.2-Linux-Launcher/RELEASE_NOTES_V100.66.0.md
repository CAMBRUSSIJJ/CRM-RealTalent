# RealTalent CRM V100.66.0 — Buyer Room / Mutual Action Plan

## Objetivo

Transformar a proposta em um espaço compartilhável de fechamento, sem criar um portal genérico de clientes. A Buyer Room conecta proposta, buying committee, documentos e um Mutual Action Plan ao mesmo negócio e devolve os sinais de engajamento para o Deal Intelligence.

## Entregas

- Buyer Room por proposta com estado próprio: rascunho, compartilhada, ativa, concluída e arquivada.
- Link público de alta entropia, revogável, regenerável e com expiração opcional.
- Página pública sem login com proposta resumida, stakeholders, documentos e plano conjunto.
- Mutual Action Plan com etapas do vendedor, comprador ou compartilhadas; prazo, bloqueio e conclusão.
- Comprador pode atualizar somente etapas sob responsabilidade `buyer`/`shared`.
- Comentários públicos do comprador e rastreamento de abertura de documentos.
- Participantes derivados do Account 360, com identificação de papéis essenciais.
- Gerenciamento interno na aba Propostas e ação direta no Proposal 360.
- Buyer Room acompanha novas revisões de proposta e sincroniza aceite/fechamento.
- Merge de Leads preserva Buyer Rooms no modo local e no Supabase.
- Deal Intelligence usa abertura/progresso/bloqueios da Buyer Room como sinais explicáveis.
- Diagnóstico de integridade detecta sala órfã, token duplicado e mais de uma sala ativa por proposta.
- Migration V100.66 com RLS e RPCs capability-based; execução `PUBLIC` explicitamente revogada.

## Segurança

O token da Buyer Room funciona como segredo de capacidade. Ele possui 192 bits aleatórios no cliente, pode ser regenerado ou desativado, e pode expirar. As RPCs públicas só retornam uma visão sanitizada da sala. Mutação pública é limitada a etapas atribuídas ao comprador/compartilhadas, comentários e telemetria da própria sala.

## Compatibilidade

- Preserva as 36 migrations anteriores e adiciona uma migration incremental.
- Sem nova dependência de runtime.
- Snapshot local antigo continua válido porque `buyerRooms` é opcional e normalizado para lista vazia.
- A gravação/transcrição de chamadas continua fora do CRM, no RealTalent Connect.
