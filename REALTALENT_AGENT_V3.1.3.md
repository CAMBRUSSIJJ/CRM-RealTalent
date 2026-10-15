# RealTalent Agent V3.1.3 — CRM Embedded Agent Experience

## Objetivo

Transformar a Agent do CRM em uma superfície realmente embutida no produto. O fluxo principal do CRM não abre mais `http://127.0.0.1:8791/chat` em outra aba. O runtime central continua em `:8791`, mas a conversa comercial permanece no drawer do CRM.

## Experiência

- Painel lateral docked, não modal.
- O restante do CRM continua clicável enquanto a Agent está aberta.
- Navegar entre Contatos, Pipeline, Tarefas, Follow-ups, Agenda etc. não fecha a Agent.
- Modo compacto e expandido sem sair do CRM.
- `Explicar tela` executa a pergunta no próprio drawer.
- Contexto da rota e entidade selecionada é atualizado continuamente.
- A entidade selecionada na tela tem prioridade sobre referências de respostas anteriores.
- Última sessão é preservada por workspace em `sessionStorage`.
- Preferência de painel expandido é preservada em `localStorage`.
- Sugestões iniciais mudam de acordo com a rota atual.
- Informações de engenharia/monitoramento ficam recolhidas em `Modo técnico`.

## Grounding e segurança

A V3.1.3 preserva CRM Native Tools Read Only V1 da V3.1.2. O App Context continua aplicando `TeamAccess`, filtros de registros e acesso a campos sensíveis antes da sincronização com o runtime. O gateway mantém a segunda validação de leitura.

Esta versão não adiciona novas mutações de negócio. A camada Native Read permanece `zeroMutation = true`. Escritas legadas governadas pela Execution Intelligence continuam exigindo confirmação explícita.

## Launcher Linux

`realtalent crm` passa a usar o navegador padrão para operação normal. Chromium gerenciado só é utilizado quando `REALTALENT_MANAGED_BROWSER=1`, ou por rotinas específicas de Browser QA.

