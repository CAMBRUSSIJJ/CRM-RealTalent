# RealTalent CRM V101.5.1 — Reliability & Data Integrity Hotfix

Release de correção sobre a V101.5.0. Não adiciona um novo módulo; corrige falhas confirmadas pela auditoria técnica antes da próxima expansão funcional.

## Correções críticas

### Calling isolado por contexto
- recovery passa a usar chave `workspace + user`;
- payload persistido inclui `schemaVersion`, `workspaceId` e `userId`;
- áudio usa chave `workspace + user + attemptId`;
- recovery valida escopo e existência do lead antes de restaurar;
- chaves globais legadas deixam de ser usadas para recuperação e são descartadas como migração de privacidade.

### Gravação resiliente
- chunks do MediaRecorder são persistidos incrementalmente no IndexedDB;
- o Blob completo não é mais reconstruído e regravado a cada 500 ms;
- ao encerrar, a gravação é consolidada em um único Blob e os chunks temporários são limpos;
- recovery consegue reconstruir o áudio a partir dos chunks caso o browser/processo seja interrompido antes da consolidação.

### Integridade Supabase/Storage
- `registerCallOutcome` marca o commit da RPC;
- erros posteriores ao commit não removem mais o arquivo já referenciado pela chamada persistida;
- removido bloco `if (calendarEventId)` duplicado no pós-processamento.

## Correções de dados comerciais

### Responsável
- `listLeads()` resolve `owner_id` usando membros/perfis do workspace;
- `ownerName` passa a ser view-model derivado, e não fonte canônica;
- ficha rápida e formulário de lead usam seletor de membro e persistem `ownerId`;
- owner removido/inacessível aparece como `Usuário removido`, em vez de assumir `Equipe` silenciosamente.

### Relações Lead → Conta → Contato
- criado resolver único para contatos, relacionamentos e oportunidades;
- contatos ligados explicitamente ao lead continuam válidos;
- contatos da conta só entram quando existe `companyId` real;
- `null === null` nunca é interpretado como vínculo comercial;
- Account 360 e Lead Workspace passam a usar a mesma regra.

## Correção de interface
- Modo Completo ainda abre estratégia/detalhes inicialmente;
- botões `Recolher` e `Menos detalhes` agora realmente fecham suas seções;
- Modo Foco volta a recolher as seções ao ser selecionado;
- Deal Intelligence acompanha o disclosure real, não o nome do modo.

## QA desta release
- auditoria sintática e contratos de integração;
- gate específico V101.5.1;
- regressão histórica;
- testes unitários adicionados para isolamento de storage e relações com `companyId = null`;
- typecheck/build completos continuam dependentes das dependências npm disponíveis no ambiente.
