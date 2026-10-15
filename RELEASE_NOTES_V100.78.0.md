# RealTalent CRM V100.78.0 — Propostas + Catálogo 2.0

## Objetivo
Unificar Pipeline e Propostas e transformar o Catálogo em uma área operacional consistente para criação e manutenção de ofertas comerciais.

## Propostas sincronizadas com o Pipeline
- A área **Propostas** mostra apenas propostas vigentes de leads ativos que estejam em uma etapa reconhecida como **Proposta** no Pipeline.
- O reconhecimento aceita nomes equivalentes como `Proposta`, `Proposal`, `Orçamento` e `Quote`, preservando pipelines customizados.
- Ao criar uma proposta para um lead fora dessa etapa, o CRM move automaticamente o negócio para a etapa principal de Proposta e registra a mudança de etapa.
- A criação de novas propostas é bloqueada quando o Pipeline não possui nenhuma etapa reconhecida como Proposta, com orientação visível para correção.
- O seletor do editor prioriza leads na etapa de Proposta, preservando compatibilidade quando a criação é iniciada diretamente pelo card do Pipeline.
- Propostas históricas continuam preservadas no banco, nas revisões, Buyer Rooms, Receita e Forecast; apenas o workspace operacional de Propostas é filtrado pelo estado atual do Pipeline.

## Layout de Propostas
- Hero deixa explícita a sincronização com Pipeline.
- Toolbar, cards e tabela recebem padronização de espaçamento, estados de hover, hierarquia visual e responsividade.
- Estado vazio orienta a mover o negócio para Proposta no Pipeline em vez de sugerir registros desconectados.
- Removido do filtro operacional o atalho “Negócios ganhos”, pois negócios ganhos já não pertencem ao workspace ativo de Propostas.

## Catálogo 2.0
- Busca por nome, SKU, categoria e descrição.
- Filtro por categoria e por disponibilidade (ativo/inativo).
- Editor agora permite controlar a disponibilidade do item.
- Ações explícitas de **Editar**, **Duplicar**, **Ativar/Desativar** e **Excluir**.
- Duplicação cria uma cópia inativa para revisão antes de entrar em uso.
- Mostra quantas propostas utilizam cada item.
- Exclusão é bloqueada visualmente quando o item já foi utilizado; nesses casos o fluxo correto é desativar.
- Layout do catálogo foi reorganizado para leitura em linha, reduzindo ambiguidade dos antigos botões por ícone.

## Dados
- Nenhuma migration nova.
- Nenhuma quebra no modelo de ProductRecord ou ProposalRecord.
- Compatível com repositórios Local e Supabase.
