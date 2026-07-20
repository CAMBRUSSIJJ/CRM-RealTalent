# Automação pós-captura — V100.25

## Fluxo entregue

1. A Extensão RealTalent envia um lote autenticado e idempotente.
2. O endpoint valida destino, etapa, responsável, prioridade, temperatura e duplicidade.
3. O lead entra no CRM com a primeira ação definida.
4. Um evento `lead_imported` é colocado em `automation_events` com prioridade e contexto do fluxo.
5. O runner completa a cadência, gera o aviso interno e prepara os canais escolhidos.
6. O vendedor acompanha tudo em **Automações → Operação**, revisa a mensagem e confirma a ação fora do CRM.

## Estados da fila

- `queued`: aguardando processamento;
- `processing`: evento reservado pelo runner;
- `completed`: fluxo concluído;
- `failed`: falha temporária com nova tentativa agendada;
- `dead_letter`: tentativas esgotadas e intervenção necessária;
- `cancelled`: evento cancelado por administrador.

Uma trava em processamento por mais de dez minutos é liberada automaticamente. As falhas usam espera progressiva com variação curta para evitar que vários eventos retornem juntos.

## Operação segura

- o vendedor pode ler avisos e usar mensagens preparadas;
- administradores podem reprocessar ou cancelar eventos;
- WhatsApp, Instagram e e-mail não são enviados pelo runner;
- regras personalizadas devem ser simuladas antes do modo real;
- `source_id` e índices únicos impedem duplicação em novas tentativas.
