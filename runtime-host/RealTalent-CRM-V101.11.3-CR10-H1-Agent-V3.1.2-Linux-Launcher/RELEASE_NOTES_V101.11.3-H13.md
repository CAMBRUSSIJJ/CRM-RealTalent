# RealTalent CRM V101.11.3-H13 — Product Readiness & Revenue Bridge

Base: V101.11.3-H12.

## Adicionado
- Product Readiness com dimensões Identidade, Preço, Posicionamento e Venda.
- Ciclo de vida: Rascunho, Pronto para vender, Ativo no catálogo e Arquivado.
- Tipos de precificação: preço fixo, a partir de, sob consulta, gratuito e personalizado.
- Edição inline no Product Studio; o modal grande fica reservado à criação rápida.
- Conhecimento comercial estruturado: problemas, benefícios, perguntas, objeções, provas e concorrentes.
- Offer Builder para compor bundles de produtos do catálogo.
- Reconciliação histórica de itens antigos sem productId com produtos atuais.
- Revenue Contract Bridge: proposta aceita/ganha gera plano de receita previsto e idempotente por competência.
- Origem e parcela do plano de receita persistidas em revenue_entries.

## Melhorado
- Cards e tabela do catálogo passam a respeitar lifecycle e semântica de preço.
- Proposta pode adicionar uma oferta e expandir seus componentes.
- Propostas exibem produtos nos cards.
- Receita distingue MRR previsto, MRR da competência e MRR histórico.
- Reativação de receita cancelada volta para Prevista, sem reconhecer automaticamente.
- Selection controls da área comercial seguem azul RealTalent; verde permanece semântico.

## Corrigido
- Produto gratuito não é tratado como preço ausente.
- Produto “sob consulta” não exige preço numérico para readiness.
- “MRR ativo” não é mais exibido em lançamento cancelado.
- Histórico pré-Catalog First pode ser reconciliado sem alterar preço negociado original.

## Persistência
- Migration: `202610070003_v101_11_3_h13_product_readiness_revenue_bridge.sql`.
- Total esperado: 53 migrations.
