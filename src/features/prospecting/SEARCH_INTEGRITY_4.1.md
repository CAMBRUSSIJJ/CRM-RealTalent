# Garimpo Search Intelligence 4.1 — Search Integrity

Esta camada endurece a integridade da prospecção antes da revisão humana.

- A execução usa território explícito e coerente durante toda a SearchSession.
- O plano semântico da Agent participa da criação do job sem poder trocar silenciosamente o território informado pelo usuário.
- Listicles, rankings, diretórios e documentos genéricos são descartados antes da revisão.
- Cidade pesquisada não é tratada como cidade confirmada da empresa.
- Divergência geográfica explícita é rejeitada; identidade/localização ambígua vai para revisão.
- Entidades HTML são normalizadas antes da apresentação.
- O mapa usa coordenadas reais quando disponíveis.
- O redesign do Garimpo é propriedade da camada CSS canônica `prospecting-workspace.css`.

Production não é alterada por esta implementação; validação ocorre primeiro no branch Preview.
