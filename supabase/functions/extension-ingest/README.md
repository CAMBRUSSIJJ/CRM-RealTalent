# extension-ingest

Endpoint autenticado para lotes da Extensão RealTalent. O cliente envia `POST` com `Authorization: Bearer rt_live_...` e um corpo `{ "batchId": "...", "leads": [...] }`.

- máximo de 100 registros ou 1 MB por requisição;
- o `batchId` torna a requisição idempotente;
- o token é armazenado apenas como hash e pode ser girado ou revogado no CRM;
- destino, etapa, responsável, duplicidade e próxima ação vêm da Central de Integrações;
- o fluxo pós-captura pode enfileirar cadência, aviso interno e mensagens assistidas com prioridade;
- a resposta informa quantos registros foram criados, atualizados, ignorados ou enviados para revisão;
- falhas e entradas ficam em `integration_events`.
- `type: connection_test` valida a conexão sem criar lead;
- `X-RT-Connection-Name` e `X-RT-Extension-Version` identificam a instalação no CRM.

Variáveis obrigatórias: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (fornecidas pelo Supabase).
