# RealTalent CRM — Tarefas H1/H2 (prévia do quadro)

Esta prévia modifica a **interface** da aba Tarefas sem substituir os serviços de tarefas nem o WAHA. Ela depende das evoluções anteriores, empilhadas nos PRs #69–#72.

## Implementado
- Barra azul RealTalent e cinco indicadores interativos: Todas, Hoje, Atrasadas, Em andamento e Concluídas.
- Kanban com menos espaço vazio, responsivo e com rolagem horizontal em telas pequenas.
- Cartão com prioridade visual, título, responsável, equipe, prazo, vínculo CRM e checklist com barra de progresso.
- Ações no menu de cada cartão: abrir detalhes, alterar etapa, concluir e excluir (respeitando as permissões e a confirmação de exclusão).
- Arrastar usando a alça. Em teclados, usar o seletor de etapa do menu para obter o mesmo resultado.
- Notificação apenas no ícone de sino do cartão, com estado técnico obtido da fila local. Aceite do gateway não significa recebimento no telefone.
- Criar tarefa diretamente na coluna ou abrir formulário completo. A criação rápida não atribui automaticamente um responsável nem dispara WhatsApp.
- Editar tarefa em painel lateral; criação continua no modal central original, preservando o editor de lembretes.
- Três visualizações: **Quadro, Lista, Calendário**. O calendário mostra tarefas com data e seção especial para tarefas sem prazo.
- Visões nomeadas por workspace com filtros, pesquisa e modo de visualização. As visões são salvas **somente no navegador atual**.

## Validar no Linux

1. Manter conectado o contêiner WAHA em 4385. Encerrar **somente** a prévia antiga do CRM em 5174 e a ponte local em 4392 antes de trocar de versão.
2. Rodar `bash deploy/waha-direct/instalar-e-abrir-ia-audios-linux.sh` no checkout desta branch ou usar o bootstrap GitHub.
3. Abrir `http://127.0.0.1:5174/#/tasks`.
4. Conferir o cabeçalho azul, os cartões e as colunas em 1280×720 e em tela móvel. Não deve haver cabeçalho antigo sobreposto.
5. Criar uma tarefa em cada coluna com a opção `+`. O status escolhido deve ser gravado. Um erro de gravação mantém o texto para tentar de novo.
6. Alterar o status arrastando pela alça e pelo seletor de etapa (acessibilidade por teclado).
7. Abrir um cartão para editar no painel lateral; ver checklist, equipe, responsável e avisos de tarefas já existentes.
8. Abrir o sino do cartão: o estado de notificação deve ser informativo, sem alegar entrega ou leitura sem prova.
9. Criar uma visão salva (ex. `Minhas urgentes`), aplicar, atualizar a página e conferir a persistência. Verificar que outro workspace não herda a visão.
10. Alternar entre Quadro, Lista e Calendário. As tarefas sem prazo precisam aparecer no calendário, em seção separada.
11. Confirmar que tarefas anteriores, contatos, prazos, WAHA e fila de notificação permanecem intactos. Sem envio WhatsApp gerado apenas por abrir/mover visualmente um cartão.

## QA de desenvolvimento

```bash
npm ci --include=dev
npm run typecheck
npm run build
npm exec -- vitest run src/features/tasks/task-saved-views.test.ts
npm run qa:v101.11.2
```

Os testes de comunicação, tarefas, Waha e o build são executados nos GitHub Actions do PR.

## Não incluído nesta etapa

- Sincronização das visões salvas entre dispositivos.
- Edição de título diretamente na grade (abre o painel lateral).
- Criação ou alteração de tarefas por IA sem confirmação.
- Automação de propostas, reuniões ou mensagens de WhatsApp.
- Publicação em Production (aguarda validação visual e funcional).
