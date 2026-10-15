# RealTalent CRM V101.11.2 — Teams & Tasks Foundation

## Adicionado

- Nova área **Tarefas** na navegação principal.
- Nova área **Equipes** na navegação principal.
- Modelo `Team`, `TeamMembership`, `WorkTask`, `TaskRelation`, `TaskChecklistItem` e `TaskComment`.
- Persistência local por workspace e persistência Supabase quando o CRM estiver em modo cloud.
- Migration Supabase com RLS para equipes, membros, tarefas, relações, checklist e comentários.
- Tarefas com status, prioridade, responsável, equipe, prazo, tags, checklist e relação com o CRM.
- Relações com Contatos, Empresas, Oportunidades, registros comerciais, Pipeline, Playbooks e Reuniões.
- Visualizações Lista, Quadro, Hoje, Atrasadas e Concluídas.
- Filtros por responsável, equipe, prioridade e busca textual.
- Equipes com liderança, membros, cor, descrição, tarefas abertas e carga de trabalho por pessoa.

## Melhorado

- Preferências da sidebar sobem para schema v2 e exibem Tarefas/Equipes para workspaces existentes sem apagar customizações anteriores.
- Navegação móvel passa a destacar Tarefas entre as áreas primárias.
- Carga de trabalho considera quantidade, prioridade e atraso das tarefas abertas.

## Preservado

- Pipeline, Contatos, Account 360, Ligações, Connect, Garimpo, Comunicações, Login Gate e animação V101.11.1-H5.
- Dados locais existentes.
- Todas as migrations anteriores permanecem imutáveis; a V101.11.2 adiciona apenas uma migration nova.

## Limitações desta fundação

- Comentários possuem fundação de dados, mas a UI de conversa por tarefa fica para uma próxima evolução.
- Recorrência está modelada, mas o scheduler que gera ocorrências futuras ainda não é executado automaticamente.
- Integração profunda de tarefas no Meu Dia, Attention Engine e Automações será feita em hotfixes subsequentes.


## Corrigido durante o fechamento

- IDs criados no Supabase agora usam UUID puro; o modo local continua usando IDs legíveis com prefixo.
- Edições de tarefa não sobrescrevem mais `created_by`.
- A data original de conclusão é preservada quando uma tarefa concluída é editada.
- Substituição de membros, relações e checklist passa a falhar de forma explícita quando a limpeza anterior no Supabase não é concluída.
- O launcher deixou de exibir mensagens fixas de build da V101.11.1-H5 e passa a usar a release atual dinamicamente.
- Tarefas e Equipes foram registradas na Capability Matrix e no catálogo de fluxos críticos do navegador.

## QA desta release

- `qa:architecture`: aprovado.
- `check:legacy`: aprovado em 113 comandos históricos.
- Linux preflight: 361 arquivos TS/TSX aprovados.
- Builder independente: 285 módulos TypeScript transpilados.
- CSS: 74 arquivos, 0 erros de parsing.
- Gates oficiais `typecheck`, Vitest e Vite não puderam ser reproduzidos neste ambiente porque `node_modules` não está instalado; o launcher mantém a recuperação de dependências/lockfile para execução no Linux com acesso ao registry npm.

## Fora do escopo

- Esta release não altera o Communications Gateway nem resolve o incidente anterior de inicialização da porta 3002; a arquitetura de Comunicações da V101.11.0 é preservada.
