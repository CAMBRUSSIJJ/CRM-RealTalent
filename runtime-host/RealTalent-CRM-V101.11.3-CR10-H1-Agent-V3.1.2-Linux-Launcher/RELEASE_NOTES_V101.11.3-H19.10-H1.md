# V101.11.3-H19.10-H1 — Media Delivery Fix

Base: V101.11.3-H19.10 — Rich Messaging & Reliable Delivery.

## Correção principal

- corrige a regressão do `whatsapp-web.js` que podia lançar `Data passed to getter must include an id property` durante o envio de mídia;
- aplica um hotfix local no `Utils.js` do `whatsapp-web.js` antes de o bridge carregar o pacote;
- remove somente o `__x_id` privado do objeto de mídia depois da construção da mensagem, preservando o MsgKey válido gerado pelo WhatsApp Web;
- o patch é idempotente e não modifica o vendor quando uma versão futura já contém a correção equivalente;
- se a estrutura do vendor mudar de forma inesperada, o patch recusa alteração insegura em vez de editar código arbitrariamente.

## Reconciliação e duplicidade de mídia

- o bridge registra o contexto do envio outbound por `idempotencyKey`;
- `message_create` é conciliado com o envio em andamento;
- a mensagem otimista e o evento oficial passam a representar a mesma operação;
- a falha conhecida de mídia produz um único evento `failed`, preservando o anexo para retry;
- a falha conhecida não entra em retry automático infinito;
- o retry manual da H19.10 continua disponível.

## Experiência do usuário

- o erro técnico/stack do WhatsApp Web deixa de ser mostrado como mensagem principal;
- a interface apresenta `Não foi possível enviar a mídia. Use “Tentar novamente”.`;
- a bolha otimista é removida quando chega o evento oficial de falha;
- Pure Chat permanece preservado, sem proposta, follow-up ou tarefas dentro da conversa.

## Preservado

- rich messaging da H19.10: imagem, vídeo, áudio, documento e voz;
- respostas citadas QR + Cloud;
- ACK enviado/entregue/lido/falhou;
- outbox offline e retry;
- criação de contatos e grupos;
- Runtime Recovery;
- Control Center, QR e Cloud API;
- idempotência da H19.9.

## Validação

- gate específico H19.10-H1: 31/31;
- smoke do transform de vendor: 7/7;
- H19.10 Rich Messaging runtime: 7/7;
- arquitetura completa: PASS;
- Linux preflight: 375 TS/TSX.

## Limitações

- o envio físico para uma conta WhatsApp real precisa ser validado no computador com a sessão QR do usuário pareada;
- typecheck/Vitest/Vite oficiais não puderam ser executados de forma válida porque o registry npm ficou indisponível no ambiente de geração;
- o build independente transpila 299 módulos, mas seu HTML fallback é legado e foi removido do pacote final.
