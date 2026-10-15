# RealTalent Agent V1.10 — Identity & Team Governance

## Objetivo
Conectar a governança operacional da RealTalent Agent ao usuário, workspace, equipe e perfil de acesso já resolvidos pelo RealTalent CRM, preservando o modo local como fallback quando não houver identidade sincronizada.

## O que entrou
- Identity Context persistente em `~/.local/state/realtalent-agent/identity-context.json`.
- Endpoint `POST /identity/sync` para o CRM sincronizar usuário, workspace, profile, equipes, scopes e actions.
- Endpoint `GET /identity` para inspeção segura do contexto ativo.
- Endpoint `POST /identity/check` para preflight de política sem executar a operação.
- Expiração do claim local em 15 minutos e heartbeat do drawer do CRM a cada 5 minutos.
- Mapeamento de governança:
  - Administrador / owner / admin → `admin`.
  - Gestor / líder → `manager`.
  - Vendedor / SDR / viewer → `operator`.
- Política adicional por identidade:
  - Vendedor/SDR/viewer: sem Builder, Autonomous Engineering ou Programs estratégicos.
  - Gestor: pode investigar/operar fluxos e aprovar HIGH, mas não pode Builder/código.
  - Administrador: pode Builder, Programs, rollback e política crítica.
- Aprovações registram `decidedBy` com usuário e role efetivos.
- Audit log inclui sincronização/limpeza de identidade e mantém cadeia SHA-256.
- Control Center mostra identidade do workspace, perfil efetivo e capacidades.
- Chat técnico mostra identidade/workspace na gaveta de detalhes.
- Blue Ocean lê a identidade ativa da mesma Agent; quando aberto após o CRM, herda a governança já sincronizada.
- CLI `./identidade-agent.sh`.

## Segurança / limite de confiança
A V1.10 recebe o contexto já resolvido pelo frontend do CRM através de loopback `127.0.0.1`. O Runtime permanece restrito a loopback e persiste o claim com modo `0600`.

Isso vincula as decisões da Agent ao usuário/workspace/perfil real exibido pela sessão do CRM, mas **não é ainda uma atestação criptográfica do JWT do Supabase**. Um processo local com acesso ao mesmo usuário do sistema poderia chamar o endpoint de loopback. Para uma implantação multiusuário/remota, a próxima hardening deverá validar um token assinado ou usar um backend autenticado como autoridade de identidade.

## Compatibilidade
Toda a infraestrutura V1.9 permanece: Conversation Intelligence, Project Brain, Deep Visual QA, Autonomous Engineering, Builder Sandbox, Workflows, Missions, Programs e Production Governance.
