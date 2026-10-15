# RealTalent CRM V100.79.0 — Mapa de Contas 2.0

## Mapa comercial
- Textos e ações foram padronizados para separar claramente território, localização e cobertura comercial.
- **Claro, Ruas e Escuro** agora usam mapas-base realmente distintos; antes os três botões carregavam o mesmo tile e apenas aplicavam filtros CSS.
- A escolha de mapa-base, exibição (pontos/calor/mista), coloração, métrica de calor e prospects fica salva por workspace.
- Novo filtro **Risco da conta** cruza o território com Account 360: alto, médio, baixo ou conta sem stakeholders mapeados.
- O KPI de cobertura passa a destacar contas de alto risco, ausência de decisor e pendências geográficas.
- A ficha territorial usa a linguagem **Organograma da conta** e abre diretamente o mapa decisório.

## Account 360 / Organograma
- “Buying committee” foi substituído por **Organograma de decisão**.
- O grafo ganha faixas de Decisão final, Patrocínio/Aprovação, Influência/Validação e Operação/Uso.
- Nós indicam **Já contatado** ou **Ainda não contatado**.
- Cards de stakeholders recebem ações rápidas de Ligar, WhatsApp e E-mail, respeitando `doNotContact`.
- Painel lateral exibe até quatro oportunidades relacionadas à conta.

## Dados e compatibilidade
- Nenhuma migration nova.
- `BACKUP_SCHEMA_VERSION` permanece `100.54`.
- Compatível com repositórios Local e Supabase.
- Geocodificação externa continua opcional: coordenadas salvas/manuais têm prioridade e estimativas são identificadas como aproximadas.
