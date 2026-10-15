# V100.87.0 — Automações 2.0

## Entrega

A V100.87 transforma a criação de automações em um fluxo guiado **Quando → Se → Então**, reduzindo a carga técnica sem remover os controles de segurança do motor existente.

## Principais mudanças

- builder reorganizado em quatro passos: **Quando**, **Se**, **Então** e **Testar/Ativar**;
- explicações contextuais para gatilhos, condições e ações;
- condições passam a ser realmente opcionais no builder;
- automações novas são criadas pausadas;
- execução real exige uma simulação válida da versão atual da regra antes de ser ativada;
- fingerprint invalida automaticamente o teste quando gatilho, condições, ações ou limites de segurança mudam;
- edição de lógica de uma regra live ativa pausa a automação até novo teste;
- duplicação cria cópia pausada em modo de simulação;
- sugestões de automação usam sinais da operação atual, como atividades vencidas, leads quentes e reuniões futuras;
- templates exibem o fluxo Quando/Se/Então antes de serem adicionados;
- histórico ganhou resumo de sucessos, falhas, simulações e execuções ignoradas pelas proteções;
- teste real fica explicitamente identificado como uma ação que altera o CRM.

## Banco e compatibilidade

Não há migration nova. Permanecem 38 migrations e `BACKUP_SCHEMA_VERSION = 100.54`.
