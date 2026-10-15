# RealTalent CRM V100.56.3 — UX Reliability

Release de confiabilidade de interface sobre a V100.56.2.

## Correções principais
- Modal global agora aplica autofocus apenas na abertura, sem roubar foco durante digitação.
- Modais empilhados possuem stack: somente o overlay superior responde a Escape, Tab e clique no backdrop.
- Foco inicial prioriza campos do corpo do formulário em vez do botão Fechar.
- Ficha lateral de Lead é renderizada via portal no `document.body`, evitando clipping/offset por transições de rota.
- Ficha lateral bloqueia scroll do fundo e fecha por Escape quando não há modal superior.
- Ação Editar foi movida para o cabeçalho e permanece sempre visível.
- Removida duplicidade do botão Editar na faixa horizontal de ações.
- Account 360 recebeu autofocus explícito no cadastro de stakeholder e no formulário de relação.
- Correção gramatical de stakeholder(s) na ficha comercial.
- Telefone exibido na ficha usa o contato resolvido da conta, alinhado ao Account 360.

## Escopo
Esta release não altera schema de banco nem migrations. Cadastro rápido de Lead, organograma real e Proposal Workspace permanecem para as próximas etapas planejadas.
