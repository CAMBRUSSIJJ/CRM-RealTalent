# RealTalent CRM V100.91.0 — Central de Ajuda + Onboarding

## O que entrou

- Central de Ajuda pesquisável no botão `?` da Topbar;
- ajuda contextual baseada na rota atual do CRM;
- artigos operacionais com passo a passo, dicas e abertura direta da função;
- tours guiados que navegam pelas telas reais do CRM;
- onboarding local passa a iniciar o primeiro tour após a configuração inicial;
- base de ajuda compartilhada com o RealTalent Assistant;
- perguntas como `Como faço uma proposta no CRM?` passam a consultar documentação embarcada;
- abertura do Assistant a partir da Central de Ajuda com prompt pré-preenchido;
- Auditoria funcional promove Ajuda e tutorial de `Parcial` para `Funcional`.

## Segurança e dados

- nenhuma migration nova;
- nenhuma informação externa é necessária para consultar a documentação;
- tours e progresso usam apenas armazenamento local do navegador;
- o Assistant continua passando pelo RealTalent AI Gateway e não recebe autoridade adicional de escrita.

## Compatibilidade

- `BACKUP_SCHEMA_VERSION` permanece `100.54`;
- 38 migrations históricas preservadas;
- V100.90 RealTalent AI permanece como camada de inteligência subjacente.
