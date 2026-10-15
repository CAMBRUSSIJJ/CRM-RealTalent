# RealTalent Agent V1.3 — Chat Experience

## Adicionado
- Nova Home `/chat`, com interface de conversa no estilo de uma IA moderna.
- Conversas persistentes em `~/.local/state/realtalent-agent/conversations.json`.
- Novo chat, histórico lateral e título automático pela primeira mensagem.
- Seletor de escopo: Automático, CRM, Blue Ocean ou ambos.
- Anexos de texto/imagem com limite local; binário bruto não é persistido no histórico.
- Progresso de Workflow/Mission/Program/Builder/QA traduzido para cards simples dentro do chat.
- Aprovações de Governance exibidas inline na conversa.
- Painel recolhível de detalhes com modelo, status dos produtos e execução atual.
- `./abrir-agent.sh` para abrir o Chat e `./abrir-modo-tecnico.sh` para a cabine administrativa.
- Self-test dedicado `chat-experience-selftest.mjs`.

## Melhorado
- `/control` continua existindo, mas agora é explicitamente o “Modo técnico”.
- `./abrir-control-center.sh` abre o Chat por compatibilidade com versões anteriores.
- CRM e Blue Ocean ganharam acesso direto “Abrir Agent” para `/chat`.
- Objective routing agora fica invisível para o usuário comum; detalhes técnicos aparecem apenas quando necessários.
- A IA local continua sendo padrão; OpenAI permanece opcional.

## Corrigido
- Separação entre experiência principal e infraestrutura técnica para reduzir ruído visual.
- Histórico de conversa sanitizado e limitado para evitar crescimento sem controle.
- Anexos de imagem não são enviados ao modelo local se `OLLAMA_VISION_MODEL` não estiver configurado.

## Removido da Home
- KPIs técnicos, Program/Mission/Workflow/Task como blocos principais.
- Terminologia de infraestrutura como requisito para iniciar um trabalho.

Nada foi removido do runtime: os mesmos orquestradores continuam acessíveis no Modo técnico.

## Limitações conhecidas
- A resposta usa indicador de “digitando”, mas ainda não faz streaming token-a-token do Ollama.
- Sem `OLLAMA_VISION_MODEL`, imagens anexadas não são interpretadas visualmente; a IA recebe uma nota segura e pode pedir contexto adicional.
- As conversas são locais ao usuário/máquina e ainda não têm sincronização multiusuário/Supabase.
- O chat aceita até 4 anexos por mensagem e 1,3 MB por arquivo nesta versão.
- O Chat não substitui Governance: operações sensíveis continuam exigindo autorização.
