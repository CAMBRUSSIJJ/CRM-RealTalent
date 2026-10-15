# RealTalent CRM V100.68.1 — UI Reliability Hotfix

Esta versão é um hotfix de confiabilidade visual e de interação sobre a V100.68.0. Não adiciona domínio comercial novo e não altera o schema do banco.

## Correções principais

- Normalização da pilha de overlays: Lead Drawer < drawers auxiliares < Assistant < Modal < Toast.
- Toasts de sucesso/erro ficam visíveis mesmo quando a ação ocorreu dentro de modal/drawer.
- Assistant, Central de Notificações e Personalização registram overlay global, fecham com `Esc`, restauram foco e usam scroll lock compartilhado.
- O atalho `Ctrl/⌘+J` não abre o Assistant atrás de um modal com edição em andamento.
- Topbar reorganizada em grupos de utilidades e ação primária, com layout específico para notebook e mobile.
- Clipboard resiliente: API moderna quando disponível e fallback por `execCommand('copy')` quando permissão/contexto seguro bloqueia a API.
- Ações Copiar em Buyer Room, Equipe, Playbooks, Automações, mensagens e Call Workspace agora exibem erro real em vez de sucesso falso.
- Abertura de WhatsApp, Buyer Room e buscas externas detecta pop-up bloqueado.
- URLs de Instagram, LinkedIn, Facebook e site na ficha do Lead são normalizadas para `https://` quando o usuário salvou apenas o domínio.

## Compatibilidade

- Nenhuma migration nova.
- Nenhuma dependência runtime nova.
- Revenue Intelligence, Assistant, Buyer Room, Coaching, Sales Engagement, Deal Intelligence e Sales Experience permanecem preservados.
