# RealTalent CRM V101.6.1 — Contacts Experience Completion & Meu Dia Fix

## Objetivo
Fechar os pontos observados no teste real da V101.6.0: corrigir o Meu Dia 3.0 no navegador, completar o registro de Contatos, transformar visualizações salvas em um recurso persistente e configurável, reduzir resíduos de nomenclatura Lead e tornar o Pipeline explicitamente orientado a oportunidades sem quebrar a compatibilidade histórica.

## Principais entregas
- Corrige o Meu Dia 3.0 na grade de 12 colunas do Layout Studio e integra a nova Central do dia ao sistema de personalização.
- Remove o rótulo legado “Meu Dia 2.0” do portfólio de negócios.
- Registro completo do Contato passa a oferecer busca e filtros por Notas, E-mails, WhatsApp, Chamadas, Tarefas, Reuniões e mudança de Etapa.
- Cards laterais do registro ganham ações para Empresa, Oportunidades e Conta & Decisores; Account 360 e organograma permanecem nativos.
- Visualizações de Contatos passam a salvar formato, filtros, colunas, densidade, ordenação, agrupamento, visibilidade e padrão.
- Visualizações persistem por usuário/workspace no modo Supabase, com fallback local no modo sem servidor.
- Views compartilhadas são somente editáveis/excluíveis pelo autor; outros usuários podem usar ou duplicar. Ao definir uma view compartilhada alheia como padrão, o CRM cria uma cópia pessoal.
- `#/contacts` vira URL pública de Contatos; `#/leads` continua aceito como alias legado.
- Pipeline apresenta “Nova oportunidade” e fluxo de criação orientado a oportunidade, preservando o modelo de dados atual para compatibilidade.
- Textos principais da interface foram migrados de Lead para Contato/Oportunidade onde correspondem ao conceito novo.
- Porta Linux permanece 4188.

## Compatibilidade
Os identificadores internos e a rota `leads` continuam disponíveis onde integrações históricas dependem deles. A mudança desta release é de experiência e camada pública; uma migração de cardinalidade completa Contato → várias Oportunidades não é feita nesta versão para evitar ruptura de dados existentes.

## Typecheck hotfix
- Corrigido `PromptActionOptions` no fluxo **Renomear exibição**: o campo obrigatório `description` agora é fornecido ao `promptAction`, eliminando o erro TS2345 em `src/features/leads/leads-page.tsx`.
