# Relatório de testes V100.25

## Cobertura automatizada

- TypeScript estrito e build de produção;
- testes unitários e de integração do CRM;
- persistência, idempotência e atualização de avisos e mensagens assistidas;
- normalização das novas opções do fluxo pós-captura;
- auditoria de release, segredos e arquivos obrigatórios;
- script de smoke visual ampliado para todas as áreas, Central de Integrações e nova Central Operacional;
- geração e validação do standalone.

## Observação de implantação

O teste do endpoint e do runner com um workspace real depende da aplicação da migration `202607190009_v100_25_sales_automation.sql`, dos secrets do Supabase e do deploy das duas Edge Functions. O pacote inclui o SQL e as funções atualizadas para essa validação no ambiente do cliente.

Nesta montagem, o smoke visual não foi executado porque o ambiente não tinha o pacote Playwright disponível. A tentativa foi interrompida antes de abrir o CRM; TypeScript, 96 testes, build, auditoria e standalone foram executados localmente.
