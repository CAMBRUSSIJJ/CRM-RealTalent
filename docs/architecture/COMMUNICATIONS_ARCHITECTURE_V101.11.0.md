# Communications Architecture V101.11.0

```text
External provider
   │
   ├─ WhatsApp Cloud ─ provider verification (Meta HMAC)
   ├─ Gmail Pub/Sub ─ shared webhook secret + message/history identity
   └─ Microsoft Graph ─ clientState hash + subscription identity
   │
   ▼
communications-gateway
   │
   ├─ correlation ID / structured logs
   ├─ payload limits / safe errors
   ├─ provider adapter
   └─ stable idempotency
   │
   ▼
Existing RealTalent queues/RPCs
   ├─ integration_sync_jobs
   ├─ communication_outbox
   ├─ communication_events
   └─ upsert_inbound_communication
```

## Migration strategy
The gateway is additive. Existing webhook function names remain deployed as wrappers. This allows providers to keep their current callback URLs while deployments migrate to `/communications-gateway/{provider}` at their own pace.

## Failure semantics
Authentication/configuration failures are fail-closed. Invalid external input returns 4xx. Missing required secrets return 503. Persistence failures return 5xx so the provider can retry. Existing queue workers keep exponential retry/dead-letter behavior.
