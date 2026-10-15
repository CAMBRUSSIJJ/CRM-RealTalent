# RealTalent CRM V100.70.0 — Call Preparation Workspace

## Objetivo

Transformar **Preparar ligações** em uma estação de preparação comercial antes do Modo Foco, separando claramente seleção da fila, estratégia da sessão e preferências de execução.

## O que mudou

- nova navegação interna: **Fila**, **Estratégia da sessão** e **Configurações**;
- filtros por origem, segmento, cidade, etapa, prioridade e temperatura;
- busca por lead, empresa, stakeholder ou telefone;
- seleção individual e em massa dos contatos que realmente entram na sessão;
- listas de ligação reutilizáveis salvas localmente por workspace;
- validação prévia de telefone ausente, bloqueio de contato, número duplicado, contato já realizado no dia e reunião futura;
- resumo lateral com contatos prontos, novos, retornos, atrasados, quentes e tempo estimado;
- fila visual com prioridade, temperatura, motivo da entrada e sinais operacionais;
- estratégia com objetivo comercial, Focus/Power assistido, playbook, ordenação, limite e meta;
- configurações de wrap-up, preparação do próximo contato e tela da conversa;
- CTA **Começar ligações** preserva o contrato da Central de Ligações e envia apenas contatos elegíveis.

## Segurança operacional

- contatos marcados como **Não contatar** não entram na sessão;
- contatos sem telefone continuam visíveis para diagnóstico, mas não podem ser selecionados;
- Power assistido apenas prepara o próximo lead; não inicia uma chamada automaticamente;
- não houve mudança de schema, migration ou formato histórico de backup.

## Compatibilidade

Baseada integralmente na V100.69.0 Calling Experience. `BACKUP_SCHEMA_VERSION` permanece em `100.54`.
