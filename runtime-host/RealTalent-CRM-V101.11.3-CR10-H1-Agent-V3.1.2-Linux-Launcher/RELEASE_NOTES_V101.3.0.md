# V101.3.0 — Unified Sales Workspace

A V101.3 transforma a ficha do lead no centro operacional do CRM. Em vez de obrigar o vendedor a alternar entre Leads, Playbooks, Calling, Follow-ups e Pipeline para preparar uma ação, o contexto essencial converge em um único workspace com divulgação progressiva.

## Lead como centro da operação

- nova ficha em largura ampliada, organizada em área principal + painel contextual;
- próxima ação comercial em destaque, usando Deal Intelligence quando disponível e Lead Score como fallback;
- ações rápidas de Ligar, WhatsApp, E-mail, Follow-up e Reunião sem navegar para outra tela;
- etapa, valor, responsável, contatos, origem e próxima ação permanecem editáveis/visíveis no mesmo contexto;
- deep-link direto para a oportunidade correspondente no Pipeline.

## Estratégia → Playbook → Ligação

- objetivo da conversa pode ser escolhido diretamente na ficha;
- roteiros ativos são recomendados por objetivo, etapa, stakeholder, resultado anterior e temperatura do lead;
- a escolha de objetivo/roteiro é persistida localmente por lead;
- “Usar recomendação” remove o override e volta à estratégia contextual;
- “Iniciar ligação preparada” envia objetivo e playbook ao Modo Foco;
- quick calls de Leads passam a respeitar as preferências do Strategy Hub, inclusive modo Focus/Power e seleção automática de roteiro.

## Contexto / Histórico / Notas

O painel lateral substitui a exposição permanente de blocos secundários:

- **Contexto:** próxima ação, última interação, oportunidade, buying committee, pendências e próximas reuniões;
- **Histórico:** timeline unificada de ligações, agenda e atividades com filtros;
- **Notas:** anotações permanentes do lead e informações fixadas durante chamadas.

## Deal e Account Intelligence

- Deal Health aparece de forma compacta, sem ocupar a ficha inteira;
- risco, probabilidade RealTalent e momentum permanecem visíveis quando a inteligência está ativada;
- Account 360 continua acessível no contexto do lead, com cobertura do buying committee e papel decisório.

## Progressive disclosure

A V101.3 reduz a densidade da ficha: detalhes operacionais deixam de competir visualmente com a ação principal. Exceções de qualidade e duplicidade só aparecem quando existem, e informações secundárias ficam no painel contextual.

## Compatibilidade

- RealTalent Calling V101.2 e RealTalent Phone/Connect foram preservados;
- nenhuma migration nova é necessária;
- preferências específicas do Lead Workspace usam localStorage versionado e não alteram o schema de backup V100.54;
- porta padrão Linux continua em `4187` e o RealTalent Connect em `3001`.
