# RealTalent CRM V101.10.3-H1 — Drawn Territory Search

Hotfix funcional sobre a V101.10.3 que fecha o modo **Área do mapa** do Garimpo.

## Entregue

- carregamento da cidade/região pelo Prospecting Agent;
- mapa OpenStreetMap de referência para seleção territorial;
- desenho por pontos de um polígono com desfazer, limpar e recarregar;
- bloqueio do início quando o modo mapa não possui pelo menos 3 pontos;
- polígono enviado e persistido no job e em campanhas recorrentes;
- cálculo de área do polígono em km²;
- grid territorial limitado às células que intersectam o polígono;
- subdivisão de células densas preservando o recorte desenhado;
- filtro de resultados OSM por coordenada, descartando empresas fora do contorno;
- mapa de cobertura passa a mostrar também o contorno selecionado.

## Regra de fonte no modo polígono

A descoberta web ampla por texto não é usada como fonte de novas empresas no modo polígono, porque os resultados web não carregam geometria confiável para provar que estão dentro do contorno. Websites e dados cadastrais continuam sendo usados para enriquecer empresas descobertas territorialmente.

## Compatibilidade

- package semver permanece `101.10.3`;
- Prospecting Agent passa a identificar `101.10.3-H1` para que o launcher substitua o Agent V101.10.3 anterior;
- schema persistente permanece v2;
- migrations permanecem 49/49;
- jobs e histórico da V101.10.3 são preservados.


## QA

- audit H1: `44/44`;
- audit base V101.10.3: `41/41`;
- runtime polígono: PASS;
- arquitetura: PASS (`384` arquivos, `357` contratos, `49/49` migrations);
- regressão legada: `3185 OK / 0 FAIL`;
- `typecheck`, Vitest e Vite build globais permanecem obrigatórios no launcher, mas não foram executáveis neste ambiente de montagem por ausência de `node_modules` e pacote `@whiskeysockets/baileys` fora do cache offline.
