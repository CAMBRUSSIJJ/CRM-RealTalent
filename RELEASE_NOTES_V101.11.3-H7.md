# V101.11.3-H7 — Playbook Visual Conversation Workspace

Hotfix de experiência sobre a V101.11.3-H6. Não altera schema, migrations, Calling, Connect ou Communications.

## Mudança principal
O Playbook Studio deixa de usar o modal full-screen como experiência principal e passa a ocupar a própria página de Playbooks como workspace dedicado.

## Adicionado
- mapa full-page como experiência padrão;
- toolbox e Inspector recolhíveis de forma independente;
- criação de caminho diretamente em qualquer nó;
- quick creator com nome do caminho + tipo do próximo nó;
- edição direta dos caminhos de saída no Inspector;
- pan do canvas pelo fundo e drag livre dos nós;
- separação das configurações gerais do canvas;
- validação leve do grafo com pontos para revisar;
- status de salvamento sem fechar o Studio.

## Mesma fonte de verdade
Mapa, Estrutura, Script e Simular continuam lendo o mesmo `conversationGraph`. Script e simulação não criam cópias independentes do roteiro.

## Preservado
- H6 Playbook Studio 2.0 e conversão de playbooks legados;
- H5 Calling Essential Context & Goal Link;
- H4 mapa mental compartilhado;
- H3 Calling Workspace 2.0;
- H2 Runtime Service Recovery;
- 50 migrations.
