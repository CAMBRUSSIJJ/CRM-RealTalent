# V100.86.0 — Central de Comunicação 2.0

## Entrega

A V100.86 transforma comunicação em um workspace operacional único. A nova rota **Comunicação** reúne WhatsApp, e-mail, ligações, reuniões, notas e o histórico oficial sincronizado quando o backend está conectado.

## Principais mudanças

- timeline unificada de atividades locais, ligações, Agenda e `communication_events`;
- filtros por canal, direção, período e busca textual;
- visão por lead/conta e último contato;
- canal preferido persistido por workspace;
- ações rápidas separadas de WhatsApp, E-mail, Ligação e Reunião;
- e-mail assistido via cliente local ou oficial via Google/Microsoft conectado;
- status de canal mostra quando a integração oficial está realmente disponível;
- falha de leitura externa não derruba a timeline local;
- eventos oficiais são identificados como sincronizados e não confundidos com ações assistidas.

## Banco e compatibilidade

Não há migration nova. Permanecem 38 migrations e `BACKUP_SCHEMA_VERSION = 100.54`.
