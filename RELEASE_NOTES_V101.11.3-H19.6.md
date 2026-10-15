# RealTalent CRM V101.11.3-H19.6 — WhatsApp Native UX & Follow-up Focus

Base: **V101.11.3-H19.5-H1 — Selection Overlay Runtime Fix**.

## Escopo

### WhatsApp Native UX
- Mantém o seletor compacto **WhatsApp | E-mail** no topo, conforme a direção aprovada.
- O corpo do WhatsApp deixa de tratar desconexão como conteúdo principal e passa a manter a conversa/histórico em primeiro plano.
- Conversas da inbox usam altura compacta e não esticam quando existe apenas um contato.
- O indicador técnico de realtime não é mais apresentado como “Ao vivo” ao lado do estado de conexão do canal.
- Conexão é resumida em **Conectado / Conectar** no header; QR/Cloud e detalhes continuam no Connection Center.
- Aviso de canal desconectado fica compacto, imediatamente antes do composer.
- Composer, mensagens e ações contextuais foram condensados para leitura e resposta no padrão de um mensageiro.

### Follow-up Focus
- Navegação consolidada em **Fila | Quadro | Calendário | Cadências | Desempenho**.
- Situação, busca, filtros, exibições salvas e criação ficam em uma única toolbar operacional.
- Cards da fila mostram somente prazo, canal, título, resumo curto, contato/empresa e responsável.
- Reagendamento/edição saem da linha principal e ficam em **Mais**.
- Contexto lateral mostra apenas dados essenciais, canais principais e ação prioritária; orientação detalhada fica recolhida.
- Metadados internos `[[CRM_COMMERCIAL_ACTION:...]]` são removidos antes de renderização.
- Deduplicação conservadora por origem técnica exata (`sourceType:sourceId`) reduz duplicatas sem unir eventos legítimos diferentes.

## Preservado
- Meu Dia não foi alterado.
- H19.5-H1 Selection Overlay Runtime Fix permanece na camada final de CSS.
- E-mail dedicado, Connection Center, QR/Cloud, histórico/realtime, propostas, respostas rápidas e Lead Context Drawer permanecem.
- Nenhuma migration nova.
