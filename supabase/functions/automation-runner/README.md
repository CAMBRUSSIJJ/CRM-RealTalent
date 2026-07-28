# automation-runner

Edge Function para executar regras com gatilho `activity_overdue` e consumir a fila `automation_events` mesmo quando nenhum navegador estiver aberto. A fila recebe eventos idempotentes de integrações, como `lead_imported` da Extensão RealTalent.

Configure os secrets:

```bash
supabase secrets set AUTOMATION_CRON_SECRET="uma-chave-longa"
```

Faça o deploy:

```bash
supabase functions deploy automation-runner --no-verify-jwt
```

Agende uma chamada HTTP pelo Supabase Cron ou outro agendador, enviando o header `x-automation-secret`.
A `service_role` é fornecida automaticamente no ambiente da Edge Function e nunca deve ser enviada ao frontend ou GitHub.

Uma execução processa até 50 eventos externos elegíveis, ordenados por prioridade. Falhas usam intervalo progressivo e até cinco tentativas; depois disso, o evento vai para intervenção manual. Travas com mais de dez minutos são recuperadas automaticamente.

No gatilho `lead_imported`, o runner também pode completar o fluxo pós-captura configurado na Central de Integrações: cadência, aviso interno e rascunhos assistidos. Nenhuma mensagem externa é enviada automaticamente.
