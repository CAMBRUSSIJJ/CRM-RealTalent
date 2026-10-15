# RealTalent CRM V101.10.3-H9 — Territory Engine 2.0

Base: **V101.10.3-H8 — Search Ontology**.

## O que muda

O Garimpo passa a tratar o território como uma estrutura adaptativa. Uma célula que chega ao limite de densidade do provider pode ser subdividida novamente, e suas subcélulas também podem ser subdivididas até um limite seguro. Isso reduz o risco de perder empresas em regiões densas sem criar uma expansão infinita de consultas.

### Subdivisão recursiva

O motor agora suporta:

```text
célula nível 0
  ↓ densa
4 células nível 1
  ↓ ainda densa
subcélulas nível 2
  ↓ ainda densa
subcélulas nível 3
```

A continuação depende de profundidade máxima, área mínima, limite global de células e necessidade real de continuar buscando. Quando o provider continua saturado e não é seguro subdividir novamente, a célula é marcada como **saturada** em vez de o sistema fingir que aquela região está completamente resolvida.

### Raio real

O modo **Raio** deixa de usar o retângulo delimitador como autoridade territorial. O Agent cria uma geometria circular aproximada por polígono e:

- seleciona apenas células que intersectam o círculo;
- descarta resultados fora do raio;
- calcula a área territorial a partir do círculo real.

Assim, uma busca de 15 km não inclui automaticamente empresas nos cantos de um quadrado de 30 × 30 km.

### Cobertura ponderada por área

Depois de subdividir células, contar simplesmente `células concluídas / células totais` seria incorreto. H9 passa a ponderar cobertura pela **área efetiva pesquisável** de cada célula.

A cobertura passa a persistir também:

- km² tentados;
- km² pesquisados com sucesso;
- km² com falha;
- quantidade de subdivisões;
- maior profundidade atingida;
- células saturadas.

### Editor e mapa

No território desenhado:

- vértices podem ser selecionados e arrastados;
- um vértice específico pode ser excluído;
- desfazer e limpar continuam disponíveis;
- o mapa de cobertura mostra nível de subdivisão, km² efetivos e saturação da célula.

## Runtime validado

No smoke H9, um raio real de 5 km produziu:

- **78,6 km²** ponderados;
- **21 consultas OSM**;
- **5 subdivisões**;
- profundidade **nível 2**;
- descarte correto de uma empresa colocada propositalmente fora do raio.

## Compatibilidade

H1–H8 permanecem preservados, incluindo:

- polígono territorial;
- Coverage Truth;
- proteção de filiais;
- Company Bridge;
- Enrichment Jobs;
- Progressive Processing;
- Review Workspace 2.0;
- Search Ontology.

O estado do Prospecting Agent evolui para **schema v6** e normaliza estados anteriores. O launcher prioriza migração da instalação H8.

## Segurança operacional

Defaults do Agent:

- máximo de 256 células por campanha;
- profundidade máxima 3;
- área mínima de subdivisão 0,35 km²;
- gatilho de densidade com piso de 20 resultados.

Esses limites existem para evitar explosões de consultas e podem ser configurados no ambiente.

## Banco

Nenhuma migration SQL nova. O total permanece **49/49**.

## Limite conhecido

O editor ganhou ajuste de vértices, mas ainda não é um GIS completo. Múltiplos polígonos, áreas de exclusão e edição nativa MapLibre/Leaflet não fazem parte do H9.
