# V100.88.0 — Garimpo 2.0

## O que mudou
- Revisão guiada pelo RealTalent Data Layer, sem regra fixa de 75%.
- Qualidade separada em Identidade, Contato, Origem e Cobertura.
- Estados operacionais: Pronto para aprovação, Revisão necessária e Bloqueado para envio.
- Bloqueios objetivos para falta de identidade, falta de canal de contato ou duplicidade confirmada.
- Fila de processamento prioriza registros que exigem decisão humana.
- Aprovação em lote dos registros prontos.
- Envio ao CRM liberado somente após aprovação e sem bloqueio do Data Layer.
- Exportação funcional no contrato `realtalent-data-layer/2.5` para enriquecimento externo.
- Importação do retorno do Data Layer atualiza o prospect existente em vez de criar duplicata ou ignorar os novos dados.
- Filtro de Resultados por qualidade/readiness.
- Identidade canônica prioriza CNPJ, domínio, Instagram, telefone e, por último, empresa+cidade.

## Compatibilidade
- Sem migration nova.
- 38 migrations históricas preservadas.
- `BACKUP_SCHEMA_VERSION` permanece em `100.54`.
- RT Capture/extensão continua opcional: a coleta automática externa depende de conector/extensão, enquanto revisão, importação, Data Layer e envio ao CRM funcionam no núcleo do CRM.
