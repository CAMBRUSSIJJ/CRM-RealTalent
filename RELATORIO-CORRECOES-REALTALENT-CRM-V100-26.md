# Relatório de correções — RealTalent CRM V100.26

## Parecer executivo

A V100.26 corrige os bloqueadores identificados na auditoria da V100.25 e reforça os fluxos que poderiam causar perda silenciosa, duplicidade, execução insegura, alteração parcial ou acesso de escrita por perfis visualizadores.

O pacote foi compilado, testado e navegado em desktop, 1024 px e celular. A aplicação local e o standalone estão prontos para homologação. Para uso definitivo com Supabase, é obrigatório aplicar a nova migration e publicar as duas Edge Functions em um ambiente de staging antes de produção.

## Correções dos bloqueadores

### 1. Gravação sem consentimento

Corrigido em três camadas:

- interface impede gravar ou salvar áudio sem consentimento;
- repositório rejeita gravação sem `consentAt`;
- banco possui constraint que exige consentimento e texto de consentimento quando existir `recording_path`.

### 2. Extensão apagando dados válidos

Corrigido. Atualizações de duplicados agora montam um patch somente com valores não vazios. Tags e notas são mescladas, enquanto telefone, e-mail, empresa, cidade, CNPJ e Instagram existentes são preservados quando o novo lote não trouxer um valor válido.

### 3. Automação antiga entrando em modo real

Corrigido. A ausência de `automation_guard` resulta em simulação. A migration também desativa regras antigas habilitadas que não tenham essa guarda.

### 4. Mesmo lote processado duas vezes

Corrigido. O evento de integração é reservado por uma chave idempotente antes de qualquer criação ou atualização. Uma segunda requisição concorrente recebe o evento já existente e não repete os efeitos.

### 5. Supabase inválido caindo para modo local

Corrigido. Quando o modo Supabase foi solicitado, ou quando existe configuração parcial no modo automático, a aplicação mostra um erro de configuração e não continua silenciosamente com dados no navegador.

## Ligações

- “Atendida” exige ligação iniciada e duração maior que zero.
- Troca de lead, avanço da fila e fechamento protegem notas, áudio, transcrição e cronômetro pendentes.
- `beforeunload` protege contra fechamento acidental da página.
- Áudio parcial é salvo em IndexedDB e recuperado ao reabrir.
- O consentimento não pode ser desmarcado enquanto houver gravação.
- O rascunho é limpo depois de salvar ou descartar corretamente.

## Integridade e operações em massa

- Perda do lead grava etapa, status, motivo e atividade na mesma transação.
- Movimentações em massa utilizam uma função transacional no Supabase.
- Tags em massa são aplicadas em uma única operação e sem duplicação por diferença de maiúsculas/minúsculas.
- Follow-ups em massa validam todos os itens antes de inserir.
- O repositório local faz uma única persistência após a validação integral.

## Automação e fila

- Último contato real passou a ser registrado por ligações e atividades concluídas.
- “Dias sem contato” usa `last_contact_at` e, na ausência dele, a criação do lead.
- O início do dia considera o fuso da organização, com padrão de São Paulo.
- Atividades vencidas são paginadas em blocos de 500 até o fim.
- Rollback remove notificações e rascunhos além das demais mutações.
- Eventos técnicos da fila são restritos a administradores.
- Regras e testes reais ficam bloqueados para visualizadores.

## Extensão

- Limite de 60 requisições por minuto por organização.
- Deduplicação no banco por telefone, e-mail, CNPJ ou Instagram.
- Sem corte artificial nos primeiros 5.000 registros.
- Erros individuais limitados a 50 detalhes e sem exposição de informação sensível.
- Se a primeira atividade falhar, o novo lead é removido para não deixar cadastro incompleto.
- Contadores de criados, atualizados, ignorados e revisão não duplicam o mesmo item.

## Permissões

A permissão de escrita foi centralizada no contexto da aplicação e reforçada na interface. Visualizadores não podem:

- criar, editar, arquivar ou mover leads;
- arrastar Pipeline ou executar ações em massa;
- iniciar ou excluir ligações;
- criar ou editar agenda e follow-ups;
- alterar playbooks, metas ou automações;
- capturar, importar, editar, excluir ou enviar itens do Garimpo.

No Supabase, notificações e rascunhos foram restringidos ao administrador ou ao responsável pelo lead.

## Responsividade e desempenho

- Sidebar recolhe antes em telas intermediárias.
- Topbar reorganiza ações em 1024 px.
- KPIs podem quebrar linha sem ultrapassar cards.
- Ordenação e seletores do Pipeline ocupam a largura disponível no celular.
- Escritas idênticas no `localStorage` são ignoradas.

A arquitetura local ainda utiliza `localStorage`, e o standalone continua sendo um arquivo grande por definição. A versão de produção possui divisão por rotas; uma futura etapa de otimização pode modularizar mais CSS e componentes extensos sem misturar essa mudança arquitetural com as correções críticas desta entrega.

## Validação final

- 101 testes automatizados aprovados.
- 22 arquivos de testes aprovados.
- TypeScript aprovado.
- Build de produção aprovado.
- 112 verificações de release aprovadas.
- Standalone V100.26 gerado.
- Smoke visual aprovado em desktop, 1024 px e celular.
- Zero erros de console e zero erros de página no smoke.
- Zero vulnerabilidades conhecidas nas dependências de produção.

## Passo obrigatório antes da produção Supabase

1. Fazer backup do banco.
2. Aplicar `supabase/migrations/202607190010_v100_26_reliability.sql` em staging.
3. Publicar `extension-ingest` e `automation-runner` atualizadas.
4. Testar consentimento de gravação, lote duplicado simultâneo, atualização de duplicado com campos vazios, regra sem guarda, usuário visualizador e movimentação em massa.
5. Somente depois repetir a implantação em produção.
