# V101.11.3-H12 — Commercial Product Studio & Catalog-First Proposals

## Objetivo
Transformar o catálogo em fonte de verdade comercial e ligar o ciclo **Produto → Proposta → Aceite → Bookings → Product Intelligence**.

## Principais mudanças

### Catalog-first proposals
- novas propostas começam sem item manual;
- `Adicionar produto` abre um picker com apenas produtos ativos do catálogo;
- produto selecionado traz identidade, SKU, cobrança, periodicidade, imposto, custo e política comercial;
- vendedor negocia principalmente quantidade, preço e desconto;
- produtos podem ser trocados sem recriar a linha;
- propostas antigas com item manual continuam legíveis como `Item manual legado`, mas o fluxo novo não oferece criação manual como padrão;
- snapshot comercial da H11 continua preservando preço/custo histórico.

### Aceite conectado a bookings
- registrar `Aceite` na área de Propostas passa a concluir o negócio no mesmo fluxo;
- Opportunity/Lead recebem fechamento ganho via `closeOpportunityFromProposal`;
- Revenue Intelligence passa a enxergar o booking sem exigir uma segunda ação manual;
- Receita Realizada continua separada e só é reconhecida por competência no módulo de receita.

### Commercial Product Studio
- catálogo recebe Cards/Tabela;
- clique no produto abre um Product Studio full-page/modal com:
  - Visão geral;
  - Preço;
  - Venda;
  - Performance;
- produto passa a ter `valueProposition`, `targetCustomer` e `salesNotes`;
- criação de produto vira progressive disclosure: nome, tipo, categoria, preço e cobrança primeiro; detalhes ficam para depois;
- Product Studio calcula win rate, propostas, preço médio vendido, desconto médio, bookings TCV, MRR ganho, pipeline por produto e margem média vendida;
- cross-sell é inferido a partir de produtos que aparecem juntos nas propostas.

### Catálogo como ciclo comercial
- nova faixa visual: Catálogo → Propostas → Aceite → Bookings → Inteligência;
- KPIs do catálogo passam a priorizar Pipeline vinculado, Bookings e adoção do catálogo;
- Product Studio mostra completude comercial do produto e gaps de posicionamento.

## Persistência
Nova migration:
`202610070002_v101_11_3_h12_commercial_product_studio.sql`

Adiciona em `products`:
- `value_proposition`
- `target_customer`
- `sales_notes`

Total de migrations: **52**.

## Compatibilidade
- sem alteração destrutiva de schema;
- itens manuais antigos continuam suportados;
- H11 Pricing Engine e snapshots continuam sendo a base financeira;
- Product Intelligence é derivada das propostas atuais, sem duplicar dados de receita.
