# Changelog V100.36 — Automação Profissional

## Implementado

- nova área Webhooks dentro de Automações;
- ação `send_webhook` no construtor;
- endpoints POST, PUT e PATCH com headers, timeout e tentativas;
- teste auditável de endpoint;
- logs de entrega com status, HTTP, erro e número de tentativas;
- correlação de execução, duração e profundidade da cadeia;
- bloqueio por profundidade máxima e regra recorrente na mesma cadeia;
- janela anti-loop e proteções de duplicidade já existentes reforçadas;
- validação para manter webhook como última ação;
- templates renomeados e mantidos em simulação segura;
- migration e Edge Function para despacho protegido.

## Compatibilidade

Nenhuma aba comercial foi removida. A versão mantém Leads, Pipeline, Follow-up, Ligações, Agenda, Mapa, Métricas e o Motor Comercial Unificado.
