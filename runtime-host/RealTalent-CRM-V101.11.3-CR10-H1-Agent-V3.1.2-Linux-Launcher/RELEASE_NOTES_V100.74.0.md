# V100.74.0 — Functional Audit & Reliability Baseline

Versão dedicada a responder uma pergunta antes de continuar expandindo o RealTalent CRM: **o que funciona de verdade hoje?**

## O que entrou

- nova seção **Configurações > Auditoria funcional**;
- matriz de capabilities com quatro estados explícitos:
  - **Funcional**;
  - **Parcial**;
  - **Visual apenas**;
  - **Não implementado**;
- distinção entre recurso local, recurso que depende de Supabase/OAuth e recurso externo ainda não conectado;
- explicação da limitação atual e do próximo passo recomendado para cada ferramenta;
- evidência técnica recolhível para facilitar manutenção;
- filtros por status e indicador de maturidade funcional;
- exportação da auditoria para JSON;
- QA estático dedicado `qa:v100.74.0`;
- correções preventivas de tipagem em validação de `relationshipScore` opcional e metadata de cadência.

## Constatações principais

A base atual possui implementação funcional para Leads, Pipeline, Follow-ups, sessões de ligação/Modo Foco, Propostas, Catálogo, Agenda interna, Metas, Receita/Forecast, métricas, backup e o núcleo de automações.

Continuam como **parciais** as áreas que dependem de infraestrutura externa ou precisam de refinamento específico, incluindo Mapa com geocodificação exata, telefonia por provedor, Google/Microsoft Calendar, e-mail, WhatsApp, Garimpo integrado, notificações e o RealTalent Assistant atual.

A **IA própria do RealTalent Assistant** permanece explicitamente classificada como **não implementada**. O provider atual é determinístico e local; isso evita apresentar uma IA generativa inexistente como se já estivesse operacional.

## Compatibilidade

- nenhuma migration nova;
- `BACKUP_SCHEMA_VERSION` permanece `100.54`;
- preserva V100.73.1 e todo o workspace de ligações.
