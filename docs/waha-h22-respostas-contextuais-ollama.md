# RealTalent Comunicação H22 — Respostas contextuais com Qwen/Ollama

**Estado:** implementação no PR #78 (prévia Linux). Não publicada em Production.

## Objetivo

Na aba **Comunicação**, selecionar **WAHA** e uma conversa individual.
Acima do campo de mensagem estão as ações:

- **Sugerir resposta**: usa o histórico real da conversa no WAHA para propor uma
  mensagem, em português brasileiro, sem enviá-la.
- **Melhorar meu texto**: aparece quando você já escreveu um rascunho.
  A IA reformula sua mensagem sem acrescentar preços, prazos ou compromissos.

O assistente abre no próprio chat (sem abrir outra janela). A primeira
sugestão é preparada com **tom objetivo**. Os demais estilos são
**Consultiva, Comercial, Amigável e Profissional**. Clique em um estilo
para gerar outra proposta ou use **Outra resposta**.

Para usar a sugestão, clique em **Inserir no campo**, confira o texto,
edite como preferir e só então clique no botão habitual **Enviar**.
Se já houver texto no campo, o CRM pedirá confirmação antes de substituir.

As conversas de grupo não apresentam sugestão inline neste marco, para
evitar respostas atribuídas incorretamente a participantes diferentes.
A função do painel **IA local** permanece disponível separadamente.

## Funcionamento e privacidade

- Reutiliza a rota autenticada da ponte local WAHA
  `POST http://127.0.0.1:4392/v1/ai/conversation`.
- O servidor lê o histórico real **da conversa selecionada** no WAHA, com
  até 45 mensagens aproveitáveis e transcrições de áudio disponíveis.
- Processa o texto no **Ollama local** (prioriza Qwen3 8B).
- Não usa API paga de IA, não envia mensagens automaticamente, não atualiza
  o Pipeline, não cria tarefas e não altera o Supabase.
- O usuário pode refazer sugestões; o resultado anterior é descartado
  se houver mudança de conversa, e uma sugestão se torna obsoleta quando
  chegam mensagens novas.
- A integração **não utiliza ainda dados de propostas ou Pipeline** na
  sugestão inline: esses dados exigem vínculo confirmado do contato com o CRM.
  Não devem ser atribuídos a um chat apenas por nome semelhante.
- A modalidade de atendimento **automático opt-in** permanece separada,
  sem qualquer mudança em sua ativação ou limites.

## Como atualizar a prévia Linux

Preserve o Docker WAHA conectado. Encerre apenas o processo da prévia CRM
na porta 5174 e a **ponte anterior 4392** (caso esteja ativa); não mate
processos desconhecidos e não reinicie o contêiner WAHA.

```bash
cd ~/Downloads/RealTalent-G43 || exit 1
curl -fL --retry 3 \
  "https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/garimpo-trigger-intelligence-g43-supabase-20261106/deploy/waha-direct/instalar-e-abrir-ia-audios-linux.sh" \
  -o start-linux.sh
chmod +x start-linux.sh
./start-linux.sh
```

O instalador verifica que a ponte responde com a funcionalidade
`inline-reply-g411`; se uma ponte antiga permanecer ativa, solicita seu
encerramento ao invés de substituí-la silenciosamente.

Abra `http://127.0.0.1:5174/`, entre em **Comunicação → WAHA**, selecione
uma conversa individual e clique em **Sugerir resposta**.

## Verificação local

```bash
TOKEN_FILE="$HOME/.local/share/realtalent-waha-direct/access-token"
if [[ -f "$TOKEN_FILE" ]]; then
  curl --noproxy '*' --silent --show-error --fail \
    -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \
    http://127.0.0.1:4392/v1/features
fi
```

O JSON deve incluir `inline-reply-g411`. **Não compartilhe a chave
local**, prints que exibam o token nem o conteúdo de chats privados.

No GitHub Actions, a suíte `WAHA Conversation Intelligence - QA` testa
segurança dos rascunhos, tipos de resposta, transcrições, TypeScript e build.
