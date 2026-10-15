# RealTalent CRM V101.8.4-H15 — WhatsApp Contact Identity

## Objetivo

Corrigir a identidade das conversas WhatsApp e transformar contatos importados em vínculos persistentes do CRM sem poluir automaticamente a base comercial.

## Correções

- Uma conversa WhatsApp sem vínculo deixa de herdar o último contato selecionado no CRM.
- O seletor **Ir para contato** fica vazio em threads ainda não vinculadas, em vez de mostrar Carlos Almeida ou outro contato anterior.
- Ao trocar de conversa, `selectedLeadId` é limpo quando a thread não possui vínculo.
- O número da outra ponta da conversa passa a ter precedência sobre o telefone cadastrado no Lead para envio dentro daquela thread.
- Vínculos históricos incorretos gerados pela H14 são reparados em memória quando o `leadId` não corresponde ao telefone da outra ponta.
- Adiciona **Salvar contato** para criar um Contato/registro comercial a partir de uma conversa WhatsApp.
- Adiciona **Vincular existente** para associar uma thread a um contato já cadastrado sem alterar o telefone do cadastro.
- O vínculo é persistido por número e thread no workspace local e reaplicado após reload.
- A criação de contato usa a infraestrutura oficial do CRM (`createLead`), preservando Contact Identity Sync, estrutura comercial e persistência local/Supabase.

## Comportamento esperado

1. selecionar um número não vinculado mostra a identidade real do WhatsApp;
2. Carlos Almeida não aparece em threads de terceiros;
3. clicar em **Salvar contato** cria o contato no CRM;
4. recarregar a página mantém o vínculo;
5. mensagens futuras continuam entrando na mesma conversa e usando o destinatário correto.
