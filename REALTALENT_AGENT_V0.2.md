# RealTalent Agent V0.2 — CRM Agent Tools

A V0.2 amplia a execução controlada do RealTalent Agent sem conceder autoridade direta ao modelo.

## Tools
- `crm.create_followup`
- `crm.move_opportunity`
- `crm.create_task`
- `crm.update_lead_profile`
- `crm.create_goal`
- `crm.create_proposal`

Toda mutação é revalidada no frontend contra o snapshot atual e exige confirmação humana. Tarefas passam pelo controle de acesso de Equipes/Tarefas. Atualizações de perfil usam as permissões do AppContext. Propostas são criadas como draft usando o preço e a configuração do produto existente no catálogo; a IA não fornece nem sobrescreve preço.

A chave `OPENAI_API_KEY` permanece somente no RealTalent Agent Runtime local e não é incluída no bundle do browser.

Não existem tools de delete, envio automático de mensagens, pagamentos, alteração de permissões ou comandos de sistema nesta versão.
