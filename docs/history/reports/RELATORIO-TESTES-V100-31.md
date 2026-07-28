# Relatório de testes — RealTalent CRM V100.31

## Escopo validado

- Nova aba independente **Mapa Comercial** na navegação desktop e móvel.
- Carregamento da mesma base local de Leads.
- Resumo de leads, cidades, valor de pipeline e ações atrasadas.
- Filtros por busca, cidade, etapa, responsável, prioridade e vencimento.
- Alternância de cor dos marcadores por etapa ou prioridade.
- Agrupamento por cidade.
- Seleção de lead e painel de ações rápidas.
- Abertura de ligação, WhatsApp, rota e retorno à base de Leads.
- Visualização local de contingência quando o provedor de mapas não está acessível.

## Resultados

- Chromium desktop 1440 × 1000: aprovado.
- Chromium móvel 390 × 844: aprovado.
- Overflow horizontal móvel: 0 px.
- Console e erros de página durante os fluxos testados: nenhum.
- Filtro por Porto Alegre: 1 lead retornado corretamente.
- Seleção de lead: painel comercial e centralização habilitados corretamente.
- Verificação sintática do runtime JavaScript: aprovada.
- Transpilação sintática do módulo TypeScript/React: aprovada.

## Observação técnica

A instalação completa das dependências para recompilar o projeto não foi concluída porque o registro de pacotes retornou HTTP 503 para `xmlchars-2.2.0`. Por isso, o pacote inclui o código-fonte atualizado e o executável V100.31 validado diretamente no Chromium. O mapa usa OpenStreetMap/Leaflet quando há conexão e uma visualização geográfica local de contingência quando o provedor externo não carrega.
