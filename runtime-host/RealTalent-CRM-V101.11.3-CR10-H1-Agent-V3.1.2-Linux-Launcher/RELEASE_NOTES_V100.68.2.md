# RealTalent CRM V100.68.2 — Settings & Pipeline UX

## Objetivo
Reduzir ruído visual no Pipeline e transformar Configurações em uma central mais fácil de navegar, sem alterar regras comerciais ou o modelo de dados.

## Pipeline Intelligence
- bloco recolhível com `aria-expanded`;
- estado aberto/recolhido persistido por workspace nas preferências locais do Pipeline;
- resumo compacto permanece visível quando recolhido: saúde média, valor em risco, forecast e prioridades;
- comportamento responsivo para notebook e mobile;
- nenhuma alteração no cálculo de Deal Health, riscos, forecast ou Next Best Action.

## Central de Configurações
- busca por termos e categorias;
- navegação agrupada em Pessoal, Workspace e Sistema;
- descrições curtas por seção;
- cabeçalho contextual da seção atual;
- status de alterações pendentes/salvas mais visível;
- painel de saúde/diagnóstico lateral recolhível;
- layout responsivo revisado.

## Compatibilidade
- sem migrations novas;
- `BACKUP_SCHEMA_VERSION` permanece 100.54;
- preferências antigas do Pipeline são normalizadas automaticamente com `intelligenceCollapsed: false`.
