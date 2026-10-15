# RealTalent CRM V100.83.0 — Notificações 2.0

## Objetivo
Centralizar notificações operacionais em uma única regra, separar canais reais de integrações futuras e permitir que cada usuário configure quais eventos merecem interrupção.

## Entregas
- Nova seção **Configurações → Notificações**.
- Canal **No CRM** funcional: campainha, contador e Central de notificações.
- Canal **Navegador/Desktop** funcional mediante permissão explícita do navegador.
- E-mail e WhatsApp aparecem com status de dependência de integração, sem simulação de entrega.
- Eventos configuráveis: follow-up atrasado, próxima atividade, reunião próxima, proposta sem avanço, lead parado, meta em risco e falha de automação.
- Frequência do navegador: tempo real, resumo por hora ou resumo diário.
- Horário silencioso configurável, inclusive atravessando a meia-noite.
- Janela configurável para atividades/reuniões e período de silêncio de proposta.
- Motor único `notification-engine.ts` usado pela Central e pelo contador da Topbar.
- Watcher de navegador com deduplicação e abertura da rota correta ao clicar.
- Lembretes de reunião usam o lembrete específico do evento da Agenda.
- Alterações no Pipeline continuam explicitamente não simuladas enquanto não houver event log granular de transição.

## Compatibilidade
- Preferências antigas são migradas por normalização para `ExperiencePreferences.version = 3`.
- Nenhuma migration de banco foi adicionada.
- `BACKUP_SCHEMA_VERSION` permanece `100.54`.
