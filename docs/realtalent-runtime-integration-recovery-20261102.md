# RealTalent CRM — recuperação controlada de integrações (02/11/2026)

## Identificação dos ambientes

- Produção Vercel: commit `f7ea004be2b15793eff68146298b84fe4a02efbf`.
- Runtime Railway: serviço persistente `realtalent-runtime`, supervisor `runtime-host/deploy/cloud-runtime/cloud-runtime-supervisor.mjs`.
- Supabase: projeto conectado com Edge Functions e RLS.

## Achados confirmados

1. O Railway registra HTTP 401 para `/communications/api/communications/events`, repetido por requisições periódicas. Também existem 401 em `/agent/programs`, `/agent/identity/sync`, `/agent/tools/health`, `/agent/missions` e `/agent/workflows`.
2. O frontend envia sessão Supabase ao proxy Vercel. O proxy autentica o usuário e usa tokens de máquina distintos para comunicar-se com o runtime. O supervisor Railway encaminha os tokens e o serviço de destino os valida. A resposta 401 do serviço de destino indica que a credencial interna não foi aceita. Isso **não é evidência de sessão do usuário expirada**.
3. Os tokens de máquina têm nomes definidos tanto no Vercel quanto no Railway; as ferramentas conectadas não expõem seus valores para comparação. **Igualdade dos valores ainda não foi comprovada**.
4. Existiam 33 funções no código e somente 14 implantadas no Supabase em 02/11/2026. Agora foram implantadas `maps-diagnostics`, `prospecting-search` e `client-diagnostics` com JWT obrigatório, totalizando 17 funções.
5. A disponibilidade do runtime ou do modelo Ollama não garante que uma tarefa real do CRM seja concluída.

## Correção do gateway nesta branch

- Erros 401 devolvidos pelo **upstream** após autenticação Supabase passam a ser classificados como `runtime_upstream_auth_rejected` e HTTP 502, sem expor tokens. Os erros 401 do **usuário** continuam 401.
- A consulta periódica de comunicações usa backoff limitado e identifica erro de autenticação, evitando chamadas simultâneas e tentativas a cada 5 segundos. Novo teste unitário verifica as regras.
- Não foi feita alteração em credenciais existentes. Não remover a exigência de JWT nem aceitar tokens vazios.

## Pendências para homologar o gateway (ação administrativa coordenada)

1. Conferir no Vercel Production as três variáveis `REALTALENT_AGENT_RUNTIME_TOKEN`, `REALTALENT_RUNTIME_TOKEN` e `REALTALENT_PROSPECTING_RUNTIME_TOKEN` contra os valores primários correspondentes do Railway **sem registrá-los em logs**.
2. Verificar que as três URLs upstream de Production apontam para o mesmo runtime Railway e que o header de cada serviço corresponde ao esperado; conferir `/ready` no runtime.
3. Se houver divergência, planejar rotação atômica/gradual com nova credencial válida, reinício coordenado e rollback testado; **não sobrescrever segredos selados** e não publicar os valores no Git.
4. Reexecutar requisições autenticadas de saúde, consulta de conversas, leitura de ferramentas e execução controlada de uma tarefa. A regressão deve atestar respostas 2xx, não apenas ausência de erro no dashboard.
5. Checar log do runtime para garantir que não persistem requisições 401 recorrentes.

## Funções restauradas

| Function | Deploy | Guarda |
|---|---|---|
| `maps-diagnostics` | ACTIVE (v1) | JWT e membro do workspace |
| `prospecting-search` | ACTIVE (v1) | JWT, `can_write_organization` e validação de parâmetros |
| `client-diagnostics` | ACTIVE (v1) | JWT e RLS em `system_health_events` |

A ativação não significa que credenciais do Google Places estão disponíveis. Exigir teste com usuário autenticado e resultados verificáveis antes de declarar o Garimpo funcional.

## Funções ainda não implantadas — não publicar em lote

`automation-runner`, `automation-webhook-dispatch`, `communication-sync-worker`, `communications-gateway`, `extension-ingest`, `extension-register`, `geocode-lead`, `gmail-pubsub-webhook`, `google-communications-webhook`, `integration-meta-worker`, `integration-microsoft-worker`, `integration-sync-worker`, `integration-whatsapp-worker`, `lead-geocode-worker`, `microsoft-communications-webhook`, `whatsapp-webhook`.

**Bloqueadores:** trabalhos agendados exigem segredos e limitação de privilégios; webhooks devem verificar assinatura/origem, algumas funções importam módulos em `_shared` e funções com custo externo dependem da chave do provedor. Cada serviço requer verificação de configuração, autenticação, migrações e teste ponta a ponta.

## QA para prévia

- `npm ci --include=dev`
- `npm run typecheck`
- `npm test -- src/services/communications-retry-policy.test.ts`
- `npm run build`
- Confirmar respostas de proxy com usuário válido, token upstream válido e inválido.
- Com sessão anônima, o proxy deve continuar devolvendo 401 e nunca fazer chamada ao upstream.
- Validar que o poll desacelera em caso de token inválido e retoma após corrigir o ambiente.

Produção Vercel/Railway não deve ser promovida até os testes autenticados confirmarem a recuperação.
