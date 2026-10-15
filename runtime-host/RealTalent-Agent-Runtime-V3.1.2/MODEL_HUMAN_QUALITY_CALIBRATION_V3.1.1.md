# RealTalent Agent V3.1.1 — Model & Human Quality Calibration

## Objetivo

A V3.1.1 não adiciona uma nova camada cognitiva. Ela calibra o cérebro já construído na V3.1 para o hardware e os modelos realmente instalados na máquina do usuário.

## Papéis calibrados

- `FAST`: derivado do candidato suficientemente bom com menor latência.
- `GENERAL`: conversa, síntese, português e interpretação.
- `REASONING`: decisões, matemática simples, lógica e planejamento.
- `CODER`: correção e geração de código.
- `VISION`: screenshots e interfaces.

`EMBEDDING` permanece sob o perfil de hardware/RAG nesta patch; ele não é trocado pela arena de geração.

## Arena automática

A arena usa somente modelos já instalados no Ollama. Ela não baixa modelos e não altera `agent.env`.

Cada candidato recebe tarefas por papel e coleta:

- qualidade determinística;
- latência de parede;
- tokens/s quando o Ollama fornece `eval_duration`;
- tempo de carregamento;
- tamanho residente reportado pelo `/api/ps`;
- VRAM reportada pelo Ollama quando disponível.

A recomendação pondera qualidade em 90%, velocidade em 7% e memória em 3%. O papel `FAST` é escolhido separadamente por latência entre modelos acima do piso mínimo de qualidade.

## Avaliação humana A/B

Depois da arena, os dois melhores modelos de conversa podem ser comparados em cinco prompts em português. A ordem A/B alterna para reduzir viés de posição. A preferência humana dá um bônus limitado na escolha do modelo `GENERAL`; ela não substitui os gates técnicos dos outros papéis.

## Segurança da configuração

`calibrar aplicar`:

1. exige uma arena anterior;
2. cria backup do `~/.config/realtalent-agent/agent.env`;
3. atualiza apenas papéis com recomendação válida;
4. grava proveniência em `~/.config/realtalent-agent/model-calibration.json`.

Nenhum benchmark troca modelos silenciosamente.

## Fluxo recomendado

```bash
./realtalent-agent.sh calibrar completo
```

Ou manualmente:

```bash
./realtalent-agent.sh calibrar arena all
./realtalent-agent.sh calibrar recomendar
./realtalent-agent.sh calibrar humano
./realtalent-agent.sh calibrar aplicar
```

Depois reinicie a Agent para os papéis aplicados entrarem no processo do gateway.

## Limite de validação desta release

O benchmark real do notebook não pode ser executado no ambiente de build desta release. A integração da arena foi testada ponta a ponta com um servidor Ollama simulado, incluindo descoberta de modelos, geração, ranking, persistência e aplicação do `agent.env`. A medição real precisa ocorrer no hardware do usuário.
