# RealTalent CRM V100.60.0 — Sales Experience Suite

Release consolidada do roadmap de experiência comercial originalmente distribuído entre V100.57 e V100.60. A versão preserva o hardening de dados da V100.56.4 e entrega a camada de produto para o vendedor.

## Lead Experience

- Novo Lead abre em **Cadastro rápido**, com Nome, Empresa, Telefone, E-mail, Responsável e Próxima ação.
- Dados de qualificação, empresa, endereço, origem, social e forecast ficam em **Mais informações**.
- Substitui o indicador administrativo de percentual por **Pronto para prospectar**.
- Detecta empresa existente e permite reutilizar o cadastro mestre para evitar duplicidade no Account 360.
- Mantém detecção por telefone/e-mail para possível Lead duplicado.
- Ações após salvar: **Salvar e trabalhar**, **Salvar e fechar**, **Salvar e ligar**, **Salvar e criar follow-up** e **Salvar e adicionar outro**.
- Ficha comercial recebe **edição inline** dos dados essenciais sem obrigar abrir o editor completo.

## Overlay Reliability

- Adiciona `overlay-manager` compartilhado por modais e ficha lateral.
- Troca de módulo fecha overlays transitórios antes de aplicar a nova rota.
- Navegação por histórico/hash também limpa overlays ativos.
- Modal mantém stack, focus trap e autofocus único da V100.56.3.

## Account Relationship Map

- O modo Mapa deixa de ser apenas lanes por papel e passa a desenhar um **grafo de relacionamentos**.
- Pessoas são nodes; relações são edges com tipo e espessura proporcional à força.
- Nodes comunicam papel, stance e score de relacionamento.
- Suporta **zoom**, reset/fit e reorganização manual por arraste.
- Gaps do buying committee aparecem como nodes tracejados clicáveis para adicionar a pessoa faltante.
- Cards, Lista e relações textuais continuam disponíveis como visualizações complementares.

## Proposal Workspace

- Propostas passa a abrir em **Cards** por padrão, com alternativa **Lista**.
- KPIs priorizam negociação: TCV em negociação, aguardando resposta, vencendo em 7 dias e aceites pendentes de fechamento.
- Cards mostram status, TCV, MRR, validade e próxima ação.
- Abrir uma proposta leva primeiro ao **Proposal 360**, não diretamente ao editor.
- Proposal 360 conecta timeline, condições, itens, buying committee, versão oficial e ações contextuais.
- Ação principal muda conforme o estágio: enviar, registrar visualização, criar follow-up, fechar negócio e reconhecer receita.
- Editor de proposta passa a wizard em 4 etapas: **Cliente → Itens e preço → Condições → Revisar e salvar**.
- Catálogo e análises permanecem disponíveis sem competir com a negociação principal.

## Compatibilidade e dados

- Mantém todas as proteções e a migration corretiva V100.56.4.
- Não altera `BACKUP_SCHEMA_VERSION`, que permanece `100.54`.
- Não reescreve migrations já versionadas.
