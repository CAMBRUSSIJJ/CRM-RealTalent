# RealTalent CRM V101.7.1 — UX Consolidation Hotfix 3

Esta versão continua a linha V101.7.1 sem alterar schema de banco. O foco é reduzir densidade desnecessária e consolidar a experiência observada no vídeo de 2026-09-30.

## Mudanças

- Deduplicação de toasts repetidos em janela curta, evitando pilhas de “Dados atualizados”.
- Busca global reestruturada por categorias, com resultado mais legível, estado vazio e orientação de teclado.
- Meu Dia passa a abrir com o painel “Seu dia em um relance” recolhido e expansível sob demanda.
- Pipeline Intelligence inicia recolhido em workspaces sem preferência explícita.
- Cards do Pipeline migram do antigo conjunto denso para um default mais enxuto: empresa, responsável, prioridade, valor, próxima ação e Deal Health.
- Wizard de Propostas passa a usar uma largura de leitura menor e checkbox normalizado.
- Forecast da proposta explica a diferença entre categoria comercial e probabilidade financeira.
- O passo “Quem ligar” do wizard de Ligações passa a usar o mesmo Filter Engine, Sort Menu e chips de filtros do restante do CRM.
- Navegação estrutural de Ligações e Saved Views recebem hierarquia visual distinta.
- Fila de ligações e próxima melhor ação ficam mais compactas.

## Compatibilidade

- `APP_VERSION`, `VERSION`, health e runtime permanecem em 101.7.1 para preservar contratos históricos da linha estrutural.
- Nenhuma migration nova.
- Interaction Surfaces 2.0 permanece como camada base; UX Consolidation é carregada depois.
