# RealTalent CRM V101.10.2-H1 — Prospecting Agent UX & Launch Flow

Hotfix focado no uso real do Garimpo automático no Linux.

## Corrigido

- O formulário do Garimpo Linux agora fica no mesmo bloco do Motor local.
- Segmento, região, meta e recorrência aparecem antes do botão de execução.
- O botão revalida a conexão com o Agent no clique, evitando um estado visual obsoleto.
- O fluxo Linux não depende de Google Places.
- Google Maps, Instagram, CNPJ, RT Capture e Manual ficam em “Outras formas de prospecção”.
- `http://127.0.0.1:4319/` agora abre um painel local legível, em vez de `{error:"not_found"}`.
- O painel local mostra conexão, fila, execução, navegador local e jobs recentes.
- O launcher detecta/substitui um Agent V101.10.2 antigo e preserva o estado local do Garimpo quando a pasta anterior existe.
- A sidebar deixa de expor a versão técnica do CRM.

## Segurança

O Agent continua restrito a localhost e a páginas públicas. Não implementa bypass de CAPTCHA, autenticação ou bloqueios de sites.
