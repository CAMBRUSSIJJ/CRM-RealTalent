# Auditoria final — V100.46.4

## Escopo

- erro de renderização da aba Leads;
- dados legados e incompletos;
- fila e Modo Ligação em Foco;
- remoção da Central de Comunicações;
- rotas, imports e estilos órfãos;
- build e standalone;
- migrations, RLS e arquitetura;
- publicação Vercel sem dependência do registro npm.

## Proteções aplicadas

- normalização do workspace, etapas, leads e todas as coleções do snapshot;
- valores padrão para strings, enums, datas, arrays, números e coordenadas inválidas;
- remoção de imports e rotas da Central de Comunicações;
- Agenda desacoplada por `calendar-integration.ts`;
- fluxo de ligação progressivo e painéis recolhíveis;
- auditoria específica de estabilidade de renderização.

## Critério de aprovação

A versão somente é empacotada após a homologação portátil, build oficial, standalone, auditoria de banco, preflight, release audit e manifesto aprovados.
