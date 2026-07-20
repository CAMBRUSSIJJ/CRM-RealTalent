# Migração da V99.20.1

## Nesta versão

A V100.4 importa leads de backups JSON da V99 e também de arquivos CSV. O importador procura listas em chaves comuns, incluindo:

- `leads`
- `crm_leads`
- `outbounder_leads`
- `crmLeads`
- listas aninhadas reconhecidas por campos de lead

Ele normaliza nome, empresa, telefone, e-mail, cidade, origem, etapa, temperatura, prioridade, valor, próxima ação, observações e tags.

## Processo recomendado

1. Na V99.20.1, gere um backup completo em JSON.
2. Na V100, crie um workspace de teste.
3. Vá a Configurações.
4. Selecione o backup JSON.
5. Confira quantidade, etapas e avisos.
6. Somente depois importe no workspace definitivo.

## O que ainda não é importado automaticamente na V100.4

- Histórico legado de ligações e gravações.
- Follow-ups e cadências antigos.
- Eventos antigos da Agenda.
- Metas.
- Automações.
- Playbooks.
- Preferências visuais.

A estrutura online desses módulos já existe. A importação histórica automática ainda depende de um backup real da V99 para mapear com segurança IDs, vínculos e formatos legados sem criar duplicações.
