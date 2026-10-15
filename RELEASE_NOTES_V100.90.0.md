# RealTalent CRM V100.90.0 — RealTalent AI

A V100.90 cria a camada proprietária de inteligência da RealTalent sobre o Assistant 2.0. O objetivo é separar o valor próprio do CRM (contexto, memória, ferramentas, permissões e governança) do modelo de linguagem utilizado.

## Entregas

- **RealTalent AI Gateway v1** entre interface e providers.
- **CRM Context Engine** com envelope versionado e foco em lead/proposta/rota.
- **Memória comercial por conta**, derivada da fonte de verdade atual: etapa, notas, stakeholders, atividades, ligações, reuniões e propostas.
- **Catálogo de tools/actions** com permissões `read`, `navigate`, `draft` e `write`.
- Qualquer tool que modifica o CRM exige confirmação explícita; envio de mensagem e mudança direta de Pipeline continuam reservados/desabilitados.
- **Trilha de auditoria local** com provider, intenção, tools, foco, duração e resultado, sem persistir o prompt integral.
- **Configurações → RealTalent AI** para inspecionar runtime, política de dados, tools e auditoria.
- Assistant passa a chamar o Gateway, não o provider diretamente.

## Limite deliberado

A camada RealTalent AI está implementada, mas esta versão **não treina nem hospeda um LLM próprio**. O provider ativo continua local e determinístico e nenhum dado é enviado para uma IA externa. A arquitetura permite adicionar providers generativos futuramente com credenciais server-side, minimização de dados e avaliação de qualidade.

## Banco

- Nenhuma migration nova.
- `BACKUP_SCHEMA_VERSION` permanece `100.54`.
