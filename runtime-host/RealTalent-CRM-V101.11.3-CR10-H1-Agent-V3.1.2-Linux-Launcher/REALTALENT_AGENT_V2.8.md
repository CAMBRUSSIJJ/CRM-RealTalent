# RealTalent CRM + Agent V2.8 — Execution Intelligence & Controlled Autonomy

A integração continua usando a RealTalent Agent central. A V2.8 não libera escrita silenciosa no CRM; ela introduz um protocolo verificável entre intenção, confirmação e efeito externo.

## Novo na V2.8
- Execution Plan persistente para ações propostas pela IA.
- classificação de risco e blast radius antes da execução.
- leituras de baixo risco podem ser executadas automaticamente.
- qualquer escrita exige confirmação explícita.
- confirmação pode ocorrer por etapa.
- idempotency key e recibo por ação.
- callback do CRM confirma o efeito externo; despacho não é tratado como sucesso.
- verificação pós-condição antes de concluir o plano.
- rollback/compensação é declarado somente quando tecnicamente suportado.
- ações irreversíveis, como envio de mensagem, são marcadas antes da confirmação.

## Preservado
- Advanced Reasoning & Planning V2.7.
- Learning & Evaluation V2.6.
- Multimodal Intelligence V2.5.
- Memory & Knowledge V2.4.
- Intelligence Core V2.3.
- Grounded App Intelligence V2.2.
- Tool-First, Evidence Gate, RAG, App Context Bridge e Governance.

## Limite de segurança
`maxSilentWriteActions = 0`. Um plano ou um dispatch não prova que a mutação ocorreu; somente recibo do aplicativo + pós-condição verificada concluem a execução.
