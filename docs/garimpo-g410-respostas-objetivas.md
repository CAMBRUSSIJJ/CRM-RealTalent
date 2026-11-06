# RealTalent G4.10 — Perguntas objetivas na investigação

**Entrega em desenvolvimento:** PR #78, prévia local. Não publicado em Production.
Nenhuma migração foi aplicada ao Supabase principal. O Docker WAHA não é alterado.

## Mudança de comportamento

Antes, ao perguntar **"qual é o endereço?"** ou **"qual o celular?"**, o CRM
apresentava seis a dez blocos de fontes por resposta, somando várias respostas
anteriores em uma lista extensa.

A partir do G4.10:
- **Somente a resposta selecionada** fica visível; as anteriores ficam em
  **Consultas anteriores**, recolhidas e recuperáveis.
- Perguntas diretas (endereço, rua, CEP, telefone, celular, WhatsApp, e-mail,
  horário ou site) pedem ao Ollama uma **resposta de uma frase** e uma
  referência pública quando existir, sem análise comercial desnecessária.
- A busca prioriza fontes contendo o tipo de informação solicitada (ex. número
  de telefone ou rua), sem atribuir dados não confirmados à empresa.
- Até **duas fontes realmente citadas** ficam junto da resposta; o catálogo
  completo de URLs e trechos permanece em **Conferir todas as fontes**,
  recolhido por padrão.
- O modelo não pode inventar referências: um marcador `[n]` fora dos IDs
  disponibilizados é substituído por aviso de fonte não confirmada.
- Sem evidência suficiente, a resposta informa a impossibilidade de
  confirmação; nunca adivinha telefones, endereços ou CNPJs.
- Investigações aprofundadas de Instagram G4.8/G4.9 e auditoria G4.3
  permanecem acessíveis quando solicitadas explicitamente.

## Como testar

Garimpo → Revisar → Guiada → empresa → **Investigação com IA**.

Exemplos:
- `Qual o endereço desta barbearia?`
- `Qual o celular?`
- `Analise as publicações públicas` (mantém análise comercial aprofundada)

No último caso a tela abre com uma síntese executiva; fontes, posts e análise
estratégica permanecem recolhidos.

## Linux

Pare somente a prévia anterior do CRM (porta 5174), preserve o Docker WAHA
e execute `~/Downloads/RealTalent-G43/start-linux.sh`, obtido da branch
`feat/garimpo-trigger-intelligence-g43-supabase-20261106`.

Confira que o Agent local em `127.0.0.1:8791` informa
`company-assistant-g410` em `GET /tools/company-ask/status`.
Reabra a ficha e faça **uma nova pergunta**; respostas antigas no navegador
não serão retrabalhadas automaticamente.

Os testes do backend, compilação do CRM e RLS rodam na suíte
`.github/workflows/garimpo-g43-qa.yml`.
