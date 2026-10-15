# CR8 — First Customer Runbook

## Objetivo
Ativar o primeiro cliente pagante sem transformar produção em ambiente de teste. A decisão final é **GO / NO-GO** e deve ser reproduzível pelo `runtime:commercial-readiness:cr8`.

## 1. Antes do cliente
1. Executar CR1–CR8 e registrar os relatórios.
2. Executar o CR7 production probe no domínio final.
3. Executar CR3 staging E2E com contas distintas de **Admin, Gestor e Vendedor**.
4. Fazer backup e restore drill em staging; nunca testar restore pela primeira vez em produção.
5. Publicar Termos de Uso e Aviso/Política de Privacidade em HTTPS após revisão responsável.
6. Confirmar caixa de suporte monitorada, responsável por incidentes e responsável pelo onboarding.

## 2. Criação do workspace
1. O primeiro usuário autenticado cria o workspace da empresa pela tela de primeiro acesso.
2. Confirmar Pipeline padrão, integridade, modo `supabase` e conexão com banco.
3. Configurar identidade da empresa, fuso, regras comerciais, navegação e integrações necessárias.
4. Não importar dados reais até o gate CR8 retornar `GO`.

## 3. Equipe e convites
1. Em **Configurações → Equipe e permissões**, criar convites individuais.
2. Usar contas distintas para Admin, Gestor e Vendedor.
3. Abrir cada link de convite e confirmar associação ao workspace correto.
4. Validar que o Vendedor não acessa operações administrativas/campos protegidos, que o Gestor opera o time e que o Admin administra o workspace.

## 4. First Value
Com dados autorizados do cliente, concluir um fluxo pequeno e reversível: contato → oportunidade → follow-up/tarefa → comunicação → proposta. O fechamento/receita só deve ser usado quando o cliente confirmar o cenário.

## 5. Suporte e incidente
Registrar responsável, canal de suporte, horário de atendimento e procedimento de escalonamento. Em incidente de segurança ou integridade, priorizar contenção e preservar evidências; não improvisar migrations em produção.

## 6. Rollback
Rollback de frontend é independente de rollback de banco. Reverter aplicação para release conhecida não autoriza restaurar dump automaticamente. Restore de banco exige diagnóstico, backup atual e confirmação destrutiva do CR7.

## 7. Decisão
Execute `npm run runtime:commercial-readiness:cr8`. Qualquer `BLOCK` mantém **NO-GO**. Somente todos os requisitos na mesma execução permitem **GO**. Depois do deploy, execute novamente o CR7 probe e gere `release:snapshot`.
