# RealTalent CRM V101.6.6 — Workspace UI Standardization

## Escopo

Release focada exclusivamente em **layout, filtros, botões e consistência de experiência** em Agenda e Propostas, alinhando os módulos ao padrão já consolidado em Meu Dia e Contatos. Não há migração estrutural do domínio comercial nesta release.

## Agenda

- Cabeçalho compacto e ação primária `Novo evento`.
- KPIs grandes substituídos por faixa-resumo compacta.
- Toolbar unificada com data, busca, filtros, visão e integrações.
- Filtros movidos para drawer lateral direito com atalhos e chips aplicados.
- Modal `Novo compromisso` passa a exibir primeiro apenas tipo, título, contato e data/hora.
- Status, local, descrição, agenda, responsável, lembrete e recorrência ficam em `Mais opções`.
- Terminologia visível atualizada de Lead para Contato.

## Propostas

- Cabeçalho e faixa-resumo alinhados à linguagem visual de Meu Dia/Contatos.
- Filtros de status e oficial/alternativa deixam de ocupar a toolbar permanentemente e passam para drawer lateral.
- Filtros ativos viram chips removíveis.
- Classificação e alternância Cards/Lista permanecem acessíveis de forma compacta.
- Primeira etapa de `Nova proposta` passa a apresentar `Oportunidade / contato`, usando a oportunidade já vinculada quando disponível.
- O identificador interno `leadId` foi preservado por compatibilidade; esta release não executa migração do modelo de dados.

## Preservado

Meu Dia bloqueado, Global App Bar, Contatos, Contact Views, Custom Properties, Contact Record, Account 360, Calling, Pipeline, Buyer Rooms, Revenue Intelligence e integrações existentes.
