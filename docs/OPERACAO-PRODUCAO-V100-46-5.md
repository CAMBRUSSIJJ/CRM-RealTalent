# Operação em produção — V100.46.5

## Antes da publicação

1. executar auditorias sintática, de identificadores, testes e renderização;
2. aplicar a migration V100.46.5 no Supabase;
3. validar variáveis públicas do Supabase no Vercel;
4. confirmar pelo menos um dispositivo RealTalent Connect com heartbeat recente;
5. testar uma chamada completa em organização de homologação.

## Monitoramento

- comandos `queued` por mais de 10 minutos devem expirar;
- falhas do Connect devem registrar `failure_reason` e `last_error` do dispositivo;
- sessões interrompidas permanecem recuperáveis no navegador;
- duas chamadas simultâneas para o mesmo dispositivo são bloqueadas;
- o fallback `tel:` deve permanecer disponível quando não houver Connect.

## Rollback

Republique a V100.46.4. A tabela de comandos da V100.46.5 pode permanecer no banco, pois não altera os contratos anteriores.
