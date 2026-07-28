# Plano de homologação — V100.40 Central de Extensões

## Contratos obrigatórios

1. Uma instalação pertence a uma organização e a um produto RealTalent.
2. Uma instalação revogada não registra heartbeat nem envia novos lotes.
3. Uma instalação pausada não envia lotes até ser reativada.
4. Configurações remotas são lidas por membros e alteradas somente por administradores.
5. Tokens administrativos nunca são devolvidos ao navegador.
6. Cada lote usa chave idempotente por organização e instalação.
7. A fila registra quantidade, tentativas, resultado e erro.
8. Eventos técnicos ficam isolados por organização.
9. Versões abaixo da mínima são bloqueadas.
10. O endpoint legado da RealTalent Capture continua compatível durante a migração.

## Testes operacionais

- Registrar a RealTalent Capture com usuário autenticado.
- Confirmar a instalação em Configurações → Integrações → Extensões.
- Alterar configuração e receber a nova versão no heartbeat.
- Pausar e confirmar bloqueio de envio.
- Reativar e enviar um lote válido.
- Reenviar o mesmo lote e confirmar idempotência.
- Revogar e confirmar bloqueio definitivo.
- Testar usuário de outra organização e confirmar RLS.
- Testar versão antiga e confirmar resposta de atualização obrigatória.
- Testar falha temporária e registrar nova tentativa/log.

## Gate de produção

A versão só pode ser publicada após `npm ci`, `npm run homologate`, aplicação das migrations e deploy das Edge Functions no ambiente de homologação.
