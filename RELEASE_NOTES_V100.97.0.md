# V100.97.0 — Product & Revenue Workspace

A V100.97 transforma o Catálogo em uma camada comercial conectada a Propostas e Revenue Intelligence, preservando a arquitetura da V100.96.

## Catálogo

- preço e custo unitário;
- tipo Produto ou Serviço;
- unidade comercial;
- desconto padrão por item;
- cálculo de margem comercial de referência;
- indicadores de itens ativos, recorrência, margem média e adoção em propostas;
- custo/margem visíveis diretamente na listagem;
- personalização dos blocos do Catálogo em Configurações → Páginas.

## Forecast

- visões rápidas Executivo, Vendas, Receita e Completa;
- presets alteram somente blocos do Forecast e preservam outras escolhas da página;
- personalização detalhada continua disponível em Configurações → Páginas.

## Dados

- nova migration adiciona `unit_cost`, `product_kind`, `unit_label` e `default_discount_percent` a `products`;
- modo local continua compatível com registros antigos: os novos campos são opcionais no domínio e normalizados no repositório;
- Supabase mappers, tipos e operações de create/update foram atualizados.
