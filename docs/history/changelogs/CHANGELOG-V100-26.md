# Changelog V100.26 — Confiabilidade, Segurança e Integridade

## Ligações e gravações

- Consentimento explícito passou a ser obrigatório no frontend, repositório e banco sempre que existir gravação.
- O consentimento agora guarda texto e usuário responsável.
- Uma ligação não pode ser salva como atendida sem ter sido iniciada e possuir duração real.
- Fechar, trocar ou pular um lead com informações pendentes exige confirmação.
- Gravações parciais são preservadas no navegador por IndexedDB e podem ser recuperadas.
- A retirada do consentimento fica bloqueada enquanto existir áudio associado.

## Extensão e Garimpo

- Lotes agora são reservados antes do processamento, evitando execução duplicada concorrente.
- Limite de 60 requisições por minuto por organização.
- Limite de 100 registros e 1 MB por lote mantido e validado antes do processamento.
- Deduplicação passou a usar consultas indexadas no banco, sem o limite anterior de 5.000 registros em memória.
- Atualizações ignoram campos vazios e preservam telefone, e-mail, empresa, cidade e demais dados válidos.
- Erros individuais são devolvidos de forma limitada e sanitizada.
- Uma falha ao criar a primeira atividade reverte o lead recém-criado.
- Usuários somente leitura não podem capturar, editar, importar, sincronizar, excluir, arrastar ou enviar registros ao CRM.

## Automações

- Regras sem guarda de segurança entram em simulação e regras antigas inseguras são desativadas pela migration.
- O cálculo de dias sem contato usa o último contato real, não a última edição do lead.
- Limites diários respeitam o fuso configurado, com padrão `America/Sao_Paulo`.
- Atividades vencidas são carregadas por paginação, sem corte em 500 itens.
- Rollback inclui atividades, eventos, notificações e rascunhos criados antes de uma falha.
- A fila técnica fica visível somente para administradores.

## Integridade de dados

- Movimentação para ganho ou perda passou a ser transacional, incluindo etapa, status, motivo e histórico.
- Movimentações, tags e follow-ups em massa são validados integralmente antes da gravação.
- Um registro inválido não deixa metade do lote alterada.
- `last_contact_at` foi adicionado e atualizado por triggers de ligações e atividades concluídas.
- Escritas redundantes no `localStorage` são ignoradas quando o conteúdo não mudou.

## Permissões e segurança

- O contexto da aplicação bloqueia mutações para perfis visualizadores.
- Ações de escrita foram removidas das áreas Leads, Pipeline, Ligações, Agenda, Follow-ups, Playbooks, Metas, Automações e Garimpo para perfis somente leitura.
- Políticas de notificações e rascunhos foram restringidas a administradores ou responsáveis pelo lead.
- Configuração Supabase parcial ou inválida não cai silenciosamente para o modo local.
- Nenhuma chave `service_role` foi colocada no frontend ou na extensão.

## Interface e validação

- Sidebar, topbar, KPIs e controles do Pipeline foram adaptados para 1024 px e celular.
- O teste smoke foi corrigido para navegar corretamente até Configurações antes de abrir Equipe.
- Título, versão, documentação e nomes de saída foram atualizados para V100.26.
