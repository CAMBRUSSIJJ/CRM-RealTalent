# RealTalent CRM V100.43

Release de **Propostas e Forecast**. A V100.43 conecta produtos, propostas, receita e previsão comercial ao Lead, Pipeline, Motor Comercial, automações e métricas, preservando Comunicações Oficiais, Connect Desktop e Central de Extensões.

## Fonte oficial

React + TypeScript + Vite + Supabase. O HTML e `dist/` são artefatos gerados exclusivamente dessa fonte.

## Entregas principais

- catálogo de produtos e serviços;
- cobrança única e recorrente;
- propostas versionadas com itens, desconto e imposto;
- aceite e recusa vinculados à oportunidade;
- receita única e MRR;
- categorias Pipeline, Melhor cenário, Comprometido e Fechado;
- forecast ponderado por proposta;
- RPCs transacionais e isolamento por organização.

## Validação

```bash
npm ci
npm run homologate
```

Sem acesso ao registro npm:

```bash
npm run homologate:portable
```
