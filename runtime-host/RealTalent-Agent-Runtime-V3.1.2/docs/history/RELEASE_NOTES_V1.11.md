# RealTalent Agent V1.11 — Continuous Agent

## Objetivo

A V1.11 transforma a RealTalent Agent de um sistema que trabalha somente sob comando em um agente que também pode **observar os produtos continuamente enquanto o Runtime estiver ativo**, detectar mudanças/regressões e trazer achados para investigação e correção governada.

A regra central não mudou: **detectar e investigar pode ser automático; escrever código, promover alterações, fazer deploy ou realizar mutação externa continuam sujeitos à governança e aos checkpoints humanos existentes**.

## O que entrou

- scheduler local persistente, com tick de 15 segundos;
- monitores recorrentes e event-driven;
- histórico persistente de execuções e achados;
- investigação estática opcional via Project Brain/Root Cause;
- painel **Monitoramento** no Modo técnico;
- contador de achados abertos no Chat;
- integração com objetivos recorrentes sem execução estratégica silenciosa;
- regressão pós-Builder por evento;
- CLI `monitoramento-agent.sh`;
- proteção de recursos para perfil de hardware Light;
- identidade/team governance aplicada à alteração de políticas de monitoramento.

## Monitores padrão

### Ativos por padrão

1. **CRM Daily Health** — diariamente às 07:30.
2. **Project Brain Drift** — a cada 6 horas.
3. **Production Regression** — dispara após Builder concluído com sucesso.

### Desativados por padrão no perfil Light

4. **WhatsApp Watch** — Browser QA de hora em hora.
5. **Blue Ocean QA** — Browser QA diário às 08:00.

Esses dois monitores são pesados e precisam ser habilitados explicitamente para evitar pressão desnecessária em notebooks com pouca RAM.

## Achados

Um achado pode ficar `open`, `acknowledged` ou `resolved`. Achados com severidade relevante podem receber investigação estática automática, mas essa investigação permanece rotulada como hipótese/evidência e não como causa confirmada.

A ação **Preparar correção** abre Autonomous Engineering. O fluxo continua parando no checkpoint humano antes de Builder/escrita.

## Persistência

A V1.11 adiciona, sob `~/.local/state/realtalent-agent/`:

- `continuous-monitors.json`
- `continuous-runs.json`
- `continuous-findings.json`
- `continuous-state.json`

Os arquivos de estado são gravados com permissão `0600` quando suportado.

## Limites e fronteiras de segurança

- O scheduler roda **somente enquanto o Runtime da RealTalent Agent estiver em execução**. A V1.11 não instala daemon/systemd por padrão.
- Não existe push externo (e-mail/WhatsApp/notificação do SO) nesta versão. O Chat mostra contador de achados e o Modo técnico exibe os detalhes.
- Browser QA agendado pode consumir CPU/RAM; por isso monitores pesados ficam opt-in no perfil Light.
- Um achado é evidência operacional/estrutural, não prova automática de causa raiz.
- A limitação da V1.10 permanece: a identidade sincronizada pelo CRM via loopback não é ainda atestação criptográfica do JWT Supabase no Runtime.
- Rollback global continua restrito ao estado operacional da Agent; não desfaz mutações já feitas em sistemas externos.

## Compatibilidade

Preservados: Chat, Conversation Intelligence, Project Brain, Deep Visual QA, Autonomous Engineering, Identity & Team Governance, Builder Sandbox, Workflow, Mission, Program e Governance.
