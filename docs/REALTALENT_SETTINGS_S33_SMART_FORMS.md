# RealTalent CRM — Configurações S3.3 Formulários Inteligentes
Data: 2026-10-29
PR: #22
Branch: feat/realtalent-settings-s33-smart-forms-20261029

## Escopo da evolução
Implementação construída sobre a S3.1/S3.2, preservando as regras de persistência confirmada e os controles originais.

### Comercial
- Três modelos guiados: Equilibrado, Prospecção ativa e Venda consultiva.
- O usuário primeiro escolhe um modelo, vê comparação campo a campo e decide preparar o rascunho.
- **Preparar alterações NÃO grava no CRM.** É necessário clicar em Aplicar alterações; as regras de integridade e autorização continuam valendo.
- Os modelos só alteram calendário comercial, SLA, cadência, prioridade inicial e obrigação de próxima ação.
- Pesos de Lead Score, Deal Intelligence, etapas, tags, integrações, equipes e segurança nunca são alterados pelo modelo.
- Campos operacionais ficam em seção avançada recolhida. Um resumo do SLA, follow-up e revisão de proposta permanece visível.
- Cadastros de motivos, etiquetas e tipos de atividade também ficam recolhidos.

### Notificações
- Modelos: Só o essencial, Acompanhamento completo e Menos interrupções.
- Comparação de antes/depois na tela.
- Preferências individuais são salvas apenas quando o usuário clicar em Aplicar aos meus avisos.
- Não é permitido conceder permissão de notificação do navegador silenciosamente.
- Rotinas comuns preservam o canal de navegador no estado anterior; modo silencioso pode desativá-lo.
- Formulário detalhado de frequência e horário fica recolhido, mantendo acesso aos campos.

### Navegação
- Ferramentas filtradas por Menu principal, Mais ferramentas, Ocultas e Todas.
- Busca textual por ferramenta ou nome personalizado.
- Renomear só mostra o campo de edição sob demanda.
- Contadores mostram distribuição atual nos três grupos.
- Botões antigos de reordenação e visibilidade continuam presentes.

### Empresa
- Nome, logotipo e fuso permanecem acessíveis.
- Seletores avançados de cores passam para área recolhível.
- Prévia de marca usa representação responsiva da interface com topbar, sidebar e botão principal, alimentada pelos valores atuais do rascunho.

## Segurança
- Modelos não possuem autoridade de escrita em contatos, propostas, Pipeline ou configuração de integrações.
- Comercial continua com Apply confirmado (sem autosave).
- Nenhum modelo envia mensagens, confirma permissões de navegador nem altera usuários.
- As alterações na marca e na navegação usam o comportamento de salvamento visual opcional preexistente.
- Os modelos são determinísticos, sem consulta ao Qwen, para evitar configurações inventadas.
- Comparação antes/depois se baseia nas preferências existentes, não em exemplos inventados.

## Testes
- src/features/settings/settings-smart-forms.test.ts:
  isolamento de dados, lista exata de campos, preservação de scoring, preview, permissões e mutação.
- Workflow da PR inclui testes S1/S2, S3, S3.3, GitHub Actions TypeScript e build.

## Validação manual necessária
1. Firefox 1280×720 e zoom 125%.
2. Comercial: selecionar modelo; confirmar que nada foi salvo antes de Aplicar alterações.
3. Comercial: modificar pesos avançados e verificar que um modelo não os substitui.
4. Notificações: mostrar diferenças de cada modelo e verificar que nenhuma permissão de desktop é solicitada automaticamente.
5. Navegação: testar filtros, ocultar, mostrar, renomear e reordenar.
6. Empresa: alterar logotipo, nome e cores; verificar prévia, descartar/salvar e recarregar.
7. Dados e segurança: garantir que a S3.3 não mudou os controles críticos.
8. Confirmar que as áreas WhatsApp e RealTalent AI continuam com o layout S3.2.
9. Testar modo local e Supabase e validar estados de salvamento.

## Instalação
Porta web 4197 — fechar antes outra versão da mesma porta.
Script: scripts/garimpo-g1g2-linux/abrir-com-diagnostico.sh
Nenhuma publicação de Production até homologação.

## Ajustes finais de densidade
- Eventos de Notificações agora aparecem recolhidos, com contagem dinâmica de regras ativas.
- Aparência da sidebar passou a ser opcional e recolhível, sem esconder a prévia de navegação.
- A prévia de Empresa usa uma pequena interface com topbar, sidebar e botão principal, não apenas uma faixa abstrata.
