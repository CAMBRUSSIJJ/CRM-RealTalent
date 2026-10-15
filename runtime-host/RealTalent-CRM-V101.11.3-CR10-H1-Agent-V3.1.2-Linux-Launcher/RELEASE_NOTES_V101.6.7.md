# RealTalent CRM V101.6.7 — Global Workspace UI Consistency

Release de consistência visual e operacional. Não altera o modelo comercial nem cria novas regras de negócio.

## Follow-ups
- cabeçalho compacto no padrão de Meu Dia/Contatos;
- resumo operacional compacto;
- tabs padronizadas;
- toolbar reduzida a busca, filtro e ação principal;
- etapa, prioridade, canal e responsável movidos para drawer lateral;
- filtros ativos apresentados como chips removíveis;
- terminologia visível atualizada para contato onde não há impacto estrutural.

## Métricas
- cabeçalho e toolbar compactos;
- responsável, origem e período centralizados em drawer lateral;
- chips de filtros ativos;
- tabs padronizadas;
- cards executivos e KPIs compactados sem retirar métricas;
- exportação CSV e impressão/PDF preservadas.

## Automações
- cabeçalho, resumo, tabs e toolbar alinhados ao sistema global;
- filtro contextual por área (Regras, Templates, Webhooks, Operação e Histórico) em drawer;
- selects permanentes removidos das barras internas quando redundantes;
- indicadores de saúde compactados;
- builder, preflight, simulação, webhooks e operação preservados.

## Ligações
- cabeçalho, resumo e tabs alinhados ao padrão global;
- filtros da fila e histórico movidos para drawer lateral;
- chips indicam filtros ativos;
- busca passa a usar terminologia de contato;
- seleção de fila, preparação, Calling Intelligence, histórico e configurações preservados.

## Resiliência de carregamento
- o fallback de lazy routes deixa de ser um spinner indefinido;
- após 8 segundos, a interface oferece `Tentar novamente` e `Abrir diagnóstico`;
- nenhuma alteração foi feita na lógica de carregamento de dados do CRM.

## Áreas protegidas
Meu Dia, Global App Bar, Contatos, Contact Views 2.0, Custom Properties, Contact Record, Account 360, Organograma, Pipeline, Agenda e Propostas permanecem preservados.

## QA
- 31/31 contratos específicos V101.6.7;
- 67/67 gates históricos e atuais;
- 293 arquivos na auditoria sintática;
- 262 arquivos na auditoria de integração;
- 44 migrations com checksum íntegro;
- Linux preflight e RealTalent Connect resilience smoke aprovados;
- typecheck, Vitest e build ficam a cargo do `start-linux.sh` no ambiente Linux com dependências instaladas; o cache offline deste ambiente não contém `xmlchars@2.2.0`.
