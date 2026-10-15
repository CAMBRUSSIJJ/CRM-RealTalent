# V100.99.0 — Visual Intelligence

## Objetivo

Transformar a área de Métricas em uma leitura visual mais direta, eliminar a sensação de que as visualizações “somem” ao trocar de aba e substituir o funil puramente tabular por uma representação comercial realmente explorável.

## Entregas

### Navegação de visualizações

- `Visão executiva`, `Funil`, `Perdas`, `Atividades` e `Previsão` compartilham uma âncora estável.
- A troca de aba reposiciona o viewport na área de visualização.
- A barra de abas fica sticky durante a análise.
- Movimento suave é desativado quando o sistema solicita redução de movimento.

### Funil interativo

- segmentos proporcionais ao volume alcançado;
- largura mínima para preservar legibilidade;
- hover/foco com animação;
- seleção de etapa;
- conversão, valor e volume visíveis no próprio segmento;
- painel contextual com probabilidade, tempo médio e risco;
- lista dos negócios atuais da etapa;
- abertura direta do negócio no Pipeline;
- edição da etapa usando o mesmo `StageModal` do Pipeline.

### Compatibilidade

A tabela anterior de conversão não foi removida. Ela permanece como leitura analítica detalhada abaixo da nova visualização.

## Preservado

Todas as capacidades da V100.98.2, incluindo RealTalent Connect, preparação por Playbook e Modo Foco simplificado, permanecem no pacote.
