# V101.11.3-CR4 — Commercial UX & Failure Recovery

## Objetivo
Transformar falhas do fluxo comercial em estados recuperáveis, preservando trabalho do vendedor e evitando retry cego/duplicidade.

## Implementado
- Classificação determinística: sessão, offline, conflito, aprovação, permissão/RLS, sincronização e desconhecido.
- Rascunho de proposta preservado em `sessionStorage` antes da persistência e removido somente após sucesso.
- Falha de proposta mantém o wizard aberto e apresenta mensagem acionável; retry só aparece para falhas classificadas como seguras para repetição.
- Composer oficial de e-mail/WhatsApp preserva assunto, corpo e canal durante falhas e restaura o rascunho na reabertura.
- Sessão expirada, aprovação e permissão não usam retry automático cego.
- Error Boundary e bootstrap de autenticação existentes foram mantidos como camadas de contenção.

## Segurança de dados
Nenhuma migration nova. As 58 migrations da CR3 são preservadas.

## Limitação
A CR4 prova os contratos e o comportamento local de recuperação. Falhas reais de rede, expiração de JWT e conflitos concorrentes em Supabase staging ainda dependem de credenciais/ambiente externo para chaos testing real.
