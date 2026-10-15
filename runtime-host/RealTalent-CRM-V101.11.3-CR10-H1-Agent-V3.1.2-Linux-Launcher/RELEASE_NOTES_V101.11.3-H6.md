# V101.11.3-H6 — Playbook Studio 2.0

Hotfix funcional sobre a V101.11.3-H5. Não adiciona migration e preserva Calling, Connect, Communications, Pipeline, Teams & Tasks e os contratos de dados atuais.

## Principal mudança

O módulo Playbooks deixa de depender de um editor predominantemente textual para scripts. A H6 introduz um **Visual Conversation Builder** com um grafo persistente dentro de `PlaybookGuidance`.

## Adicionado

- Playbook Studio em tela cheia;
- editor de mapa com nós posicionáveis;
- nós tipados: Fase, Fala, Pergunta, Decisão, Objeção, Ação, Resultado e Nota;
- conexões direcionais e rótulos de caminhos;
- criação de ramificações a partir de qualquer nó;
- Inspector lateral para editar tipo, título, conteúdo, objetivo e nome do caminho;
- quatro visualizações do mesmo playbook: **Mapa, Estrutura, Script e Execução**;
- simulação navegável do roteiro antes de usar com clientes;
- templates: Em branco, Cold Call, Discovery e Follow-up;
- zoom, drag de nós e auto-organização;
- geração automática de script textual para busca, Calling e compatibilidade;
- conversão automática de playbooks legados em grafo inicial;
- mapa da Biblioteca passa a usar o grafo persistido quando ele existir.

## Compatibilidade

- o editor clássico continua disponível para targeting, coaching e configurações avançadas;
- salvar pelo editor clássico preserva `conversationGraph`;
- backup/restore passa a preservar `guidance` e o grafo;
- `derivePlaybookSteps` usa o grafo quando presente, mantendo os modos de execução existentes;
- playbooks antigos continuam funcionando sem conversão obrigatória.
