# Changelog — V100.34 Motor Comercial Unificado

## Consolidação

- Centralizadas as consequências de resultados de ligação em `commercial-action-engine`.
- Centralizado o registro de resultados do Follow-up.
- As telas deixaram de executar múltiplas consequências comerciais isoladas.

## Confiabilidade

- Adicionadas RPCs transacionais para ligação e atividade comercial.
- Adicionada trava por lead e proteção de idempotência no Supabase.
- Adicionada proteção contra registros duplicados no modo local.
- Adicionado rollback da base local quando uma consequência falha.

## Sincronização

- Histórico, Pipeline, próxima ação, Agenda, cadência e tags são atualizados no mesmo fluxo.
- Reuniões encerram pendências de prospecção e criam evento.
- Resultados de ganho, perda, proposta, número inválido e contato incorreto recebem consequências padronizadas.

## Compatibilidade

- Interface e módulos existentes foram preservados.
- Mapa Comercial e geocodificação da V100.33 permanecem disponíveis.
