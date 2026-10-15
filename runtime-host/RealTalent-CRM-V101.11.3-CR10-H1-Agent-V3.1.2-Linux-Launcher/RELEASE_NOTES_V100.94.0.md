# RealTalent CRM V100.94.0 — Omnichannel Inbox

A V100.94.0 transforma a antiga Central de Comunicação em uma **caixa de entrada comercial centrada no contato**. O usuário deixa de pensar primeiro no aplicativo e passa a trabalhar a conversa: contato → canal → histórico → próxima resposta.

## O que entrou

- Nova arquitetura visual em três áreas: **Canais**, **Conversas** e **Contato/Histórico**.
- Filtros de caixa de entrada para **Todos**, **Não lidas** e **Responder**.
- Canais no mesmo workspace: WhatsApp, e-mail, Instagram, Facebook, LinkedIn, ligações e reuniões.
- Agrupamento de eventos em conversas por **lead + canal**, com preview, última interação, status e contagem de não lidas.
- Estado **Precisa responder** quando a última interação é recebida e ainda não está marcada como lida.
- Ações rápidas no contato em foco e definição de canal preferido incluindo redes sociais.
- Instagram, Facebook e LinkedIn em **modo assistido**: abrir perfil, copiar mensagem e registrar manualmente o que realmente aconteceu.
- Registro local das interações sociais assistidas, sempre identificado como **Assistido / confirmado pelo vendedor** e nunca como evento oficial.
- Integrações Meta expõem capacidades de mensagens separadas (`instagram_messages` e `facebook_messages`) para evitar confundir conta Meta conectada com inbox oficial disponível.
- Nova migration que amplia o contrato de `communication_threads` e `communication_events` para canais sociais, preparando ingestão oficial futura quando a API/capability permitir.
- Central de Ajuda e Auditoria funcional atualizadas para explicar a diferença entre canal oficial e assistido.

## Segurança de produto

A versão não automatiza ações sociais indisponíveis ou não permitidas pelos provedores. LinkedIn continua assistido. Instagram/Facebook só podem aparecer como **oficiais/sincronizados** quando uma integração conectada fornecer a capability específica de mensagens; caso contrário, o CRM usa o fluxo assistido com confirmação humana.

## Compatibilidade

A V100.94.0 preserva o Full Page UX Audit da V100.93.0, o Hardening & UX da V100.92.0, a Central de Ajuda V100.91.0 e `BACKUP_SCHEMA_VERSION = 100.54`.
