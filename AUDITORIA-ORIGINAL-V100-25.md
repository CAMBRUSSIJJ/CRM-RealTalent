# Auditoria técnica — RealTalent CRM V100.25

**Pacote auditado:** `REALTALENT-CRM-V100-25(1).zip`  
**Data:** 19/07/2026  
**Escopo:** estrutura do projeto, compilação, testes, navegação, responsividade, persistência local, ligações, Pipeline, automações, extensão, Supabase/RLS, segurança e riscos de produção.

## 1. Conclusão executiva

A V100.25 possui uma base técnica consideravelmente mais madura do que as versões baseadas em um único HTML. O projeto está organizado em React, TypeScript, Vite, repositórios local/Supabase, migrations, Edge Functions e testes automatizados. A aplicação abre, compila e navega sem falhas gerais de execução.

Entretanto, **a versão ainda não deve ser considerada plenamente pronta para produção com dados reais**. Existem falhas silenciosas que podem gerar:

- registro de ligações incorretas ou perda de uma tentativa ainda não salva;
- gravação de áudio sem marcação válida de consentimento;
- perda de dados bons durante atualização de duplicados da extensão;
- execução real de automações antigas ou malformadas sem simulação;
- duplicação de lotes concorrentes da extensão;
- operação em modo local por erro de configuração, fazendo o usuário acreditar que os dados estão online;
- comportamento inconsistente de permissões para usuários somente leitura;
- inconsistências parciais em movimentações do Pipeline e rollback de automações;
- quebra horizontal em tablets e notebooks estreitos.

## 2. O que foi validado

- Instalação limpa das dependências: concluída.
- Vulnerabilidades conhecidas pelo `npm audit`: **0**.
- TypeScript: aprovado.
- Testes automatizados: **96 de 96 aprovados**, distribuídos em 22 arquivos de teste.
- Build de produção: aprovado.
- Auditoria de release do próprio projeto: 112 verificações aprovadas.
- Geração standalone: aprovada e sincronizada com o código-fonte.
- Navegação real com Chromium: todas as 12 áreas principais abriram sem erro de console ou crash.
- Auditoria responsiva própria: 48 combinações de rota e viewport.
- Busca por segredos concretos no frontend: nenhum segredo real encontrado.
- Busca por APIs perigosas como `eval`, `document.write` e HTML injetado: nenhum uso relevante encontrado.

### Limitação da auditoria

As migrations, políticas RLS e Edge Functions foram revisadas estaticamente. Não havia um projeto Supabase real conectado para executar testes com usuários, organizações, storage, concorrência e volume. Portanto, a segurança online precisa de uma segunda validação em ambiente de homologação.

---

# 3. Problemas bloqueadores — corrigir antes de produção

## P0.1 — Gravação pode ser salva sem registro de consentimento

**Área:** Ligações  
**Arquivo:** `src/features/calls/call-workspace-modal.tsx`

A gravação exige consentimento apenas no momento em que é iniciada. Depois disso, o usuário consegue desmarcar o consentimento enquanto o áudio continua sendo gravado. Ao salvar, o arquivo de áudio pode ser armazenado, mas o campo de consentimento fica vazio.

**Impacto:** risco jurídico, de privacidade e de auditoria. O sistema pode possuir áudio sem evidência de consentimento.

**Correção recomendada:**

- bloquear a remoção do consentimento enquanto houver gravação ativa;
- ou interromper e descartar imediatamente o áudio quando o consentimento for retirado;
- validar no repositório/backend que `recording_path` só pode existir com `consent_at` preenchido;
- registrar quem confirmou, quando e qual texto de consentimento foi utilizado.

## P0.2 — Atualização de duplicado da extensão pode apagar dados bons

**Área:** Integração com a extensão  
**Arquivo:** `supabase/functions/extension-ingest/index.ts`

Quando a política de duplicados está em “atualizar”, a função envia diretamente os campos recebidos pela extensão. Campos vazios da captura, como telefone, e-mail, cidade ou empresa, podem substituir informações válidas já existentes no CRM.

**Impacto:** perda silenciosa de dados comerciais confiáveis.

**Correção recomendada:** fazer merge campo a campo, utilizando o dado recebido apenas quando ele estiver preenchido e validado. Para campos conflitantes, criar revisão ou histórico em vez de sobrescrever automaticamente.

## P0.3 — Automação sem proteção cadastrada entra em modo real

**Área:** Automações  
**Arquivos:**

- `src/services/automation-workspace.ts`
- `supabase/functions/automation-runner/index.ts`

O padrão declarado da interface é simulação. Porém, quando uma regra não possui a condição interna de proteção, o frontend e o runner interpretam a regra como **modo real**.

Isso afeta principalmente regras antigas, importadas, migradas ou corrompidas.

**Impacto:** uma automação pode mover leads, alterar prioridade, finalizar cadências e criar atividades sem o usuário ter revisado ou ativado o modo real.

**Correção recomendada:** qualquer regra sem guarda válida deve ser tratada como “simulação” e “desativada”. A passagem para modo real deve exigir ação explícita de administrador.

## P0.4 — Idempotência da extensão possui condição de corrida

**Área:** Extensão / ingestão de lotes  
**Arquivo:** `supabase/functions/extension-ingest/index.ts`

A função verifica se o lote já existe, processa os registros e só depois grava o evento de idempotência. Duas requisições simultâneas com o mesmo lote podem passar pela verificação e executar efeitos duplicados antes que uma delas falhe ao registrar o evento único.

**Impacto:** duplicação de leads, atividades e eventos em reenvios concorrentes ou instabilidade de rede.

**Correção recomendada:** reservar o `batch_id` no início, por insert atômico, RPC ou transação. Apenas o processo que conseguir reservar o lote deve continuar.

## P0.5 — Configuração Supabase incorreta cai silenciosamente para modo local

**Área:** Inicialização e deploy  
**Arquivo:** `src/lib/env.ts`

Mesmo quando `VITE_DATA_MODE=supabase`, se a URL ou a chave não forem reconhecidas, o sistema inicia no modo local. Isso evita um crash, mas pode fazer uma instalação publicada parecer funcional enquanto os dados ficam somente no navegador daquele computador.

**Impacto:** perda de dados, equipes vendo bases diferentes e falsa sensação de sincronização online.

**Correção recomendada:** em build de produção configurado como Supabase, falhar de forma bloqueante e exibir uma tela clara de “ambiente não configurado”. O fallback local deve existir somente quando escolhido explicitamente.

---

# 4. Problemas de alta prioridade

## P1.1 — É possível salvar uma ligação “Atendida” sem realizar ligação

O resultado padrão é “Atendida” e o salvamento só é bloqueado quando a sessão está em execução. Uma sessão parada, recém-aberta ou com zero segundos pode ser salva como atendimento real.

**Impacto:** métricas falsas, histórico comercial incorreto e automações acionadas pelo resultado errado.

**Correção:** exigir que a ligação tenha sido iniciada ou exigir confirmação explícita para registros manuais; usar “Sem resultado” como padrão.

## P1.2 — Dados da ligação podem ser descartados sem aviso

Os comandos “Pular”, anterior/próximo, troca de lead, fechamento do modal, clique fora e Escape podem descartar notas, transcrição, cronômetro ou áudio ainda não salvo. A troca de lead é bloqueada apenas enquanto a sessão está rodando; nos estados pausado, discando ou finalizado, os dados podem ser perdidos.

**Correção:** implementar estado “alterações não salvas” e confirmação de saída. Durante uma gravação, impedir troca de lead e fechamento até salvar ou descartar conscientemente.

## P1.3 — Recuperação de ligação não recupera áudio

A recuperação local salva lead, fila, cronômetro, resultado, notas e transcrição, mas não salva o blob da gravação nem o consentimento. Uma atualização da página ou fechamento durante a gravação perde o áudio.

**Correção:** salvar partes da gravação no IndexedDB durante a sessão ou informar claramente que somente texto e cronômetro serão recuperados.

## P1.4 — Perfil “visualizador” ainda enxerga ações de edição

O sistema exibe um aviso de que alterações estão bloqueadas, mas vários módulos continuam mostrando botões de criar, editar, excluir, mover e executar ações em massa. A RLS provavelmente bloqueia muitas dessas gravações no backend, mas a experiência fica enganosa e gera erros.

Áreas afetadas incluem Pipeline, Leads, Ligações, Agenda, Metas, Follow-up e Playbooks.

**Correção:** criar uma autorização centralizada por capacidade e ocultar/desabilitar ações em toda a interface. Depois, testar cada perfil contra o Supabase real.

## P1.5 — Motivo de perda e movimentação do Pipeline não são atômicos

Ao mover uma oportunidade para “Perdido”, o sistema primeiro adiciona o motivo nas notas e depois move a etapa. Se a segunda operação falhar, o lead permanece na etapa antiga, mas passa a ter uma anotação de perda.

**Correção:** realizar a alteração em uma única operação transacional/RPC ou reverter a nota quando a movimentação falhar.

## P1.6 — Ações em massa podem terminar pela metade

Algumas ações em massa executam lead por lead. Se houver falha no meio, os primeiros já estarão alterados, os seguintes não, e o usuário recebe apenas uma mensagem genérica.

**Correção:** usar operação em lote no backend ou mostrar um relatório com sucessos e falhas, permitindo nova tentativa somente nos itens pendentes.

## P1.7 — Rollback de automação é incompleto

O runner registra para rollback atividades, eventos e alterações do lead. Porém, alertas internos e rascunhos de WhatsApp/e-mail não entram na lista de mutações. Se uma ação posterior falhar, o sistema afirma que as alterações foram revertidas, mas esses objetos podem permanecer.

Além disso, o encerramento de cadência ignora possíveis erros individuais de atualização.

**Correção:** registrar todas as mutações, validar cada retorno e executar o fluxo em transação ou RPC sempre que possível.

## P1.8 — “Dias sem contato” mede a última edição do lead

A condição usa `lead.updated_at`. Alterar tag, prioridade, responsável ou qualquer outro campo zera o contador, mesmo sem contato com o lead.

**Impacto:** automações de lead parado deixam de funcionar corretamente.

**Correção:** manter `last_contact_at` e, se necessário, `last_activity_at`, atualizados por eventos de ligação, mensagem, reunião e follow-up concluído.

## P1.9 — Limites diários de automação usam meia-noite UTC

O cálculo do dia começa em UTC. Para São Paulo, a virada prática pode ocorrer às 21h do dia anterior, em vez de meia-noite local.

**Correção:** armazenar timezone da organização e calcular o início do dia comercial conforme esse fuso.

## P1.10 — Atividades vencidas são limitadas a 500 sem paginação

O runner busca no máximo 500 atividades vencidas. Em bases maiores, registros fora desse limite podem ficar sem processamento ou sofrer atraso indefinido.

**Correção:** paginação ordenada, cursor e limite por organização, com telemetria de backlog.

## P1.11 — Deduplicação da extensão considera apenas os primeiros 5.000 registros

Tanto leads quanto prospects são carregados com limite de 5.000 e comparados em memória. Quando a base crescer, duplicados fora desse conjunto deixam de ser detectados.

No CRM, a comparação usa principalmente telefone e e-mail; CNPJ e Instagram não são utilizados como no Garimpo.

**Correção:** índices normalizados e consulta direta no banco por telefone, e-mail, CNPJ, Instagram e identificador externo. Evitar carregar milhares de registros para memória.

## P1.12 — Endpoint da extensão não possui limitação de taxa

Há limite de 100 itens por lote e de tamanho da requisição, mas não há rate limit por token, organização ou IP.

**Impacto:** token vazado pode gerar abuso, custos, excesso de dados e sobrecarga.

**Correção:** rate limit, contador por janela, bloqueio progressivo e rotação rápida do token.

## P1.13 — Erros individuais da extensão não têm diagnóstico útil

Falhas de cada item são capturadas sem registrar causa, posição ou identificador. O resultado informa apenas a quantidade de erros.

**Correção:** registrar erro sanitizado por item, external ID e etapa, sem armazenar dados sensíveis desnecessários.

## P1.14 — Política RLS permite criação indevida de notificações para colegas

A política de insert de `seller_notifications` exige apenas que o usuário seja membro da organização. Ela não restringe `user_id` ao próprio usuário ou a administradores.

Um membro autenticado pode tentar criar ou alterar notificações destinadas a outra pessoa da equipe. Os rascunhos de contato também são amplamente editáveis por membros.

**Correção:** restringir criação/alteração ao usuário alvo, administrador ou função de servidor; preservar autoria e trilha de auditoria.

## P1.15 — Eventos internos de automação foram expostos a todos os membros

Na migration V100.25, a leitura de `automation_events` foi ampliada de administradores para todos os membros. Esses eventos podem conter payloads, erros e detalhes operacionais.

**Correção:** definir quais campos o vendedor realmente precisa ver. Usar view sanitizada para membros e manter payload técnico restrito a administradores.

---

# 5. Problemas de interface, responsividade e desempenho

## P2.1 — Overflow horizontal próximo de 1024 px

Em todas as 12 rotas testadas, a aplicação apresentou largura maior que a viewport em 1024×768. O conteúdo chegou aproximadamente a 1.057–1.145 px.

A causa principal é a topbar desktop, que mantém pesquisa, workspace, badge de modo, ajuda, atualizar, novo lead e notificações em uma única linha. O breakpoint estrutural maior só ocorre em largura menor.

**Impacto:** tablets em modo paisagem e notebooks com janela dividida exibem corte ou rolagem horizontal.

## P2.2 — Filtro/ordenação do Pipeline corta texto no celular

Em 390 px, o controle de ordenação possui conteúdo maior que o espaço disponível. O body não estoura porque o elemento fica contido, mas o texto pode ser cortado.

## P2.3 — Pequeno corte em cards de métricas

Em 1366 px, alguns textos internos de KPI ultrapassaram levemente a largura disponível. Não trava a página, mas mostra que os cards não estão completamente resilientes a textos maiores.

## P2.4 — CSS acumulado e com regras sobrepostas

`src/styles/index.css` possui aproximadamente **327 KB** e milhares de linhas. Existem várias definições repetidas para shell, topbar, navegação móvel, tabelas e breakpoints. Regras posteriores anulam regras antigas.

**Impacto:** alto risco de regressão visual, dificuldade para descobrir a origem de bugs e aumento do custo de manutenção.

**Correção:** separar por domínio/componente, remover regras mortas e manter uma única fonte para cada breakpoint.

## P2.5 — Arquivos excessivamente grandes

Principais exemplos:

- `app-context.tsx`: ~60 KB;
- `prospecting-page.tsx`: ~47 KB;
- `pipeline-page.tsx`: ~44 KB;
- repositório local: ~43 KB;
- `leads-page.tsx`: ~41 KB;
- repositório Supabase: ~41 KB;
- `settings-page.tsx`: ~40 KB;
- automation runner: ~34 KB.

**Impacto:** mudanças pequenas afetam muitas responsabilidades, dificultando testes e revisão.

## P2.6 — Bundle e standalone grandes

O build gera chunks relevantes, incluindo um chunk compartilhado acima de 360 KB. O HTML standalone possui aproximadamente 1,38 MB.

Isso ainda é utilizável localmente, mas tende a piorar com novas funções. A separação por rota e lazy loading deveria ser ampliada.

---

# 6. Persistência local e backup

## P2.7 — Toda a base local é serializada em praticamente cada alteração

O repositório local lê e grava um grande JSON no `localStorage` em muitas operações. À medida que leads, atividades e logs crescem, isso pode causar lentidão e atingir a quota do navegador.

Quando a persistência falha, o sistema muda para memória e avisa no diagnóstico. Porém, os dados dessa sessão podem ser perdidos ao fechar a página.

**Correção:** migrar dados estruturados para IndexedDB ou utilizar apenas o Supabase em produção. Criar alerta preventivo por uso de armazenamento, não somente após falha.

## P2.8 — Áudios não entram no backup JSON

A própria interface informa isso corretamente. Mesmo assim, é um risco operacional: restaurar o CRM em outro computador recupera o histórico textual, mas não as gravações.

**Correção:** exportação opcional de mídia em pacote ZIP ou retenção online vinculada ao backup.

## P2.9 — Áudio local pode ficar órfão em falhas específicas

O áudio é salvo no IndexedDB antes de o registro principal ser persistido. Se a persistência do registro cair para memória e a página for fechada, pode restar mídia sem metadado correspondente.

---

# 7. Testes e documentação

## P2.10 — O teste smoke entregue está quebrado

O script navega para Automações e, em seguida, tenta clicar na aba “Equipe”, que pertence às Configurações, sem voltar para aquela área. O teste original falha esperando esse botão.

Ao corrigir apenas o roteiro temporariamente, o smoke completo passou. Portanto, neste ponto o defeito está no teste, não na tela Equipe.

## P2.11 — Relatório de testes não cobre uso real

O relatório entregue declara que o smoke visual e o endpoint real não foram executados. Assim, a release audit aprovada não comprova o funcionamento real em navegador, perfis de usuário, Supabase ou Edge Functions.

## P2.12 — Cobertura concentrada em serviços, não em componentes

Os 96 testes são uma boa base, mas faltam testes para:

- modo visualizador em cada módulo;
- gravação, consentimento e recuperação de ligação;
- saída com alterações não salvas;
- faixa responsiva entre aproximadamente 981 e 1.100 px;
- funções da extensão;
- idempotência concorrente;
- base com mais de 5.000 registros;
- backlog acima de 500 atividades;
- migrations e RLS contra um Supabase real;
- timezone da organização;
- rollback completo de automações.

---

# 8. Pontos positivos encontrados

- Arquitetura React/TypeScript bem superior ao modelo de HTML único.
- Separação entre repositório local e Supabase.
- TypeScript, testes e build passam.
- Nenhuma vulnerabilidade conhecida encontrada nas dependências pelo npm.
- Nenhum segredo real de servidor exposto no frontend.
- Storage privado com organização no primeiro diretório e RLS básica.
- Uso de URLs assinadas para gravações online.
- Limpeza do áudio quando criação de chamada falha em etapas posteriores.
- CSP e cabeçalhos de segurança razoáveis para a aplicação.
- Funções `SECURITY DEFINER` revisadas possuem verificações administrativas e `search_path` definido nos principais pontos.
- Existe diagnóstico local, backup, integridade da base e tratamento de corrupção do JSON.
- A navegação principal não apresentou crash ou erro de console nos testes executados.
- O standalone está sincronizado com o código-fonte.

---

# 9. Ordem recomendada de correção

## Fase 1 — Proteção de dados e operação real

1. Corrigir consentimento e salvamento de ligações.
2. Impedir descarte silencioso da sessão de ligação.
3. Corrigir merge de duplicados da extensão.
4. Tornar idempotência atômica.
5. Alterar automação ausente/malformada para simulação.
6. Bloquear fallback local silencioso em produção.
7. Corrigir RLS de notificações, rascunhos e eventos internos.

## Fase 2 — Integridade dos fluxos

1. Transacionar perda/movimentação do Pipeline.
2. Criar resultado detalhado para operações em massa.
3. Completar rollback das automações.
4. Criar `last_contact_at` real.
5. Corrigir timezone e paginação do runner.
6. Refazer deduplicação da extensão no banco.

## Fase 3 — UX e estabilidade

1. Corrigir faixa responsiva de 1024 px.
2. Implementar permissões centralizadas na interface.
3. Modularizar CSS e arquivos gigantes.
4. Melhorar lazy loading e tamanho dos bundles.
5. Migrar persistência local estruturada para IndexedDB.

## Fase 4 — Garantia de qualidade

1. Consertar o smoke oficial.
2. Adicionar testes de componentes e fluxos críticos.
3. Criar ambiente Supabase de homologação.
4. Executar testes de RLS com owner/admin/member/viewer.
5. Fazer testes de concorrência, volume e recuperação de falhas.

---

# 10. Parecer final

**Estado atual:** funcional para demonstração, desenvolvimento e homologação controlada.  
**Não recomendado ainda:** produção definitiva com equipe, automações em modo real, gravações e ingestão massiva sem aplicar as correções P0/P1.

A maior parte dos problemas não aparece como tela quebrada. São falhas silenciosas de consistência, permissão, consentimento, escala e recuperação. Por isso, apenas “clicar em todas as abas” não é suficiente para certificar esta versão.
