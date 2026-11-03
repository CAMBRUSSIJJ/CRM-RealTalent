# RealTalent — Comunicação e Automações (arquitetura incremental)

## Objetivo e estado desta branch
Um único motor de eventos e uma única experiência de diagnóstico, inicialmente com o adaptador de execução local. Esta etapa **não migra dados locais para Supabase**, **não ativa WhatsApp Cloud API** e **não publica em Production**. Preserva os contatos e tarefas existentes.

### O que esta etapa entrega
- Contrato canônico `notificationEvent` (task.assigned, task.due_soon, task.reminder_requested e eventos futuros de agenda, oportunidade e proposta).
- Orquestrador na camada `src/services/notifications`, responsável por publicar eventos de Tarefas e reconciliar/cancelar no adaptador local.
- Diagnóstico **autoritativo do gateway** por tarefa: responsável, contato, opt-in, canal, prazo, fila e histórico. Não confundir checkboxes configurados com mensagens programadas.
- Ação humana única e explícita para uma tarefa anteriormente atribuída e sem novos eventos: exige opt-in já registrado, canal WhatsApp habilitado, tarefa aberta, confirmação na interface e chave idempotente. A fila registra a solicitação antes da tentativa. Resultados incertos não são reenviados automaticamente.
- Console autônomo “Comunicação e automações” em janela própria, com Programados, Precisam atenção, Histórico e Diagnóstico. A página principal de Tarefas não reserva espaço para uma central vazia.
- Indicadores nos cartões baseados no estado confirmado pelo gateway, jamais em marcação de formulário.

### Limites preservados
- O número local é armazenado em Equipes; não exige login do colaborador.
- Ativação experimental por WhatsApp QR deve ter autorização prévia e não é a API oficial.
- Gateway e computador devem permanecer ligados para automação local.
- “Aceito pelo gateway” não significa entregue ou lido.
- A execução oficial por Meta, verificação dos telefones, webhooks e atendimento a preferências legais continuam pendentes.

## Arquitetura-alvo (etapa de migração, não executada aqui)

1. **Produtores**: Tarefas, Agenda, Pipeline, Propostas e Fluxos de trabalho publicam eventos imutáveis `{event_id,workspace_id,type,entity_id,recipient_id,occurred_at,payload}`.
2. **PostgreSQL Supabase** torna-se fonte transacional de verdade para destinatários internos/externos, consentimento, preferências, eventos e entregas. Contatos locais sem conta são representados por `recipient_id` próprio, não `auth.uid()`.
3. **Outbox transacional** grava evento e decisão de notificação na mesma transação do domínio. `unique(workspace_id,event_id,recipient_id,channel,rule_id)` garante idempotência.
4. **Worker Railway** consome filas de forma concorrente via `FOR UPDATE SKIP LOCKED`, registra tentativas, backoff apenas quando o provedor comprova que o envio não ocorreu, e preserva estado incerto para análise manual.
5. **Regras por destinatário** são aplicadas antes de enfileirar: permissão explícita por canal/objetivo/telefone, horários silenciosos, preferência de resumo, limite de frequência e prioridade.
6. **Adaptadores de transporte** independentes: notificações internas, e-mail e WhatsApp Business Platform. QR fica reservado à operação de chat/teste local até homologação.
7. **Webhooks autenticados** da Meta atualizam `accepted/sent/delivered/read/failed` com IDs externos e verificação de assinatura; sem webhook não apresentar “Entregue”.
8. **Console** consulta projeções por workspace/usuário aplicando RLS e auditoria de alterações; status pode ser diagnosticado sem acesso a credenciais, tokens ou números completos.

## Plano de migração segura
- Inventariar chaves de tarefas e colaboradores locais por workspace; gerar mapeamento estável sem duplicar pessoas.
- Exportação/backup explícito e prévia de conflitos; migrar dados em lotes com modo de leitura antes de ativar a fonte central.
- Ativar `cloud_outbox_read_only` primeiro. Comparar eventos e projeções com dados locais sem enviar mensagens.
- Fazer shadow mode de regras, com **envio externo desativado** e análise de divergências.
- Validar consentimento individual e números com o destinatário. Nunca copiar opt-in antigo como autorização automaticamente homologada.
- Escolher um único worker ativo por workspace/canal durante cutover; não disparar simultaneamente gateway local e Railway.
- Fazer teste controlado com destinatário autorizado, sem repetição automática, e inspecionar webhooks.
- Promover a produção em fases, com rollback que para o worker sem descartar a fila e sem duplicar mensagens.

## Casos de aceitação
- Uma tarefa com Marcelo sem prazo e atribuída há horas **explica** por que a fila está vazia.
- Uma tarefa sem autorização não oferece programação manual.
- Enviar aviso manual exige confirmação, e repetir a solicitação à mesma tarefa não envia outra mensagem.
- WhatsApp sem conexão nunca é representado como entregue.
- Ao concluir/excluir tarefas, cancelamentos são confirmados antes de alterar dados.
- A fila e a autorização do gateway sobrevivem a reinicialização e mudança da pasta de download.
