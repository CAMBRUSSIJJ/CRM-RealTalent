# V101.11.3-H19.3 — WhatsApp Sales Workspace

## Objetivo
Transformar o chat WhatsApp da Central de Comunicação em uma superfície de execução comercial, sem substituir a infraestrutura H19.2 de QR/Cloud, gateway, histórico, realtime e identidade.

## O que foi adicionado
- estados comerciais explícitos por conversa: **Aguardando você**, **Aguardando cliente** e **Resolvido**;
- nova mensagem posterior ao ajuste manual reabre o estado a partir da direção real da conversa;
- ação contextual em cada mensagem para criar **Follow-up**, **Tarefa** ou **Nota**;
- vínculo da atividade com a mensagem de origem via `originEventKey`, com bloqueio de duplicação local;
- cinco respostas rápidas comerciais com personalização de nome/empresa;
- seleção de proposta vigente diretamente no composer;
- criação/reuso de Buyer Room e ativação do link privado para compartilhar a proposta;
- proposta só muda de `draft` para `sent` depois que o envio do WhatsApp retorna com sucesso;
- compartilhamento é registrado na atividade da Buyer Room com canal WhatsApp;
- estado muda automaticamente para **Aguardando cliente** após envio.

## Preservado
- H19.1 Communication Workspace;
- H19.2 WhatsApp Connection Center;
- WhatsApp QR local e Cloud API;
- Communications Gateway e recovery;
- histórico/realtime;
- identity/contact binding;
- sub-abas por canal e contexto CRM;
- 54 migrations, sem schema novo.

## Persistência dos estados
Nesta H19.3 o estado comercial manual da conversa é armazenado no escopo do workspace no storage seguro do cliente. Ele é deliberadamente separado do transporte do WhatsApp e é invalidado por mensagem nova posterior ao ajuste. Nenhuma migration foi criada.

## QA da release
- arquitetura completa: PASS;
- H19.3: 66/66;
- H19.2: 54/54;
- sintaxe: 412 arquivos;
- contratos de integração: 380 arquivos;
- migrations: 54/54;
- release manifest: 85/85;
- repository parity: Local 100/100 e Supabase 100/100;
- CSS Governance: 65/65;
- Linux preflight: 373 TS/TSX;
- transpile independente: 297 módulos;
- runtimes: Communications Recovery 5/5, Connect Recovery 5/5 e Security 12/12.

Os gates oficiais `typecheck`, `vitest` e `vite build` foram executados/tentados, mas permanecem **bloqueados pela ausência de `node_modules`** neste ambiente. A tentativa de `npm ci` falhou por DNS/registry (`EAI_AGAIN` em `registry.npmjs.org`). O `validate:env` do build passou. O fallback legado foi auditado, rejeitado como HTML legado e o `dist` foi removido do pacote final.

## Limitação conhecida
O estado manual **Aguardando você / Aguardando cliente / Resolvido** é persistido no `safeStorage` do workspace nesta H19.3. Portanto, ainda não é um estado compartilhado por banco entre navegadores/dispositivos. A chegada de uma mensagem nova posterior ao ajuste manual força a reinferência do estado para evitar conversa resolvida incorretamente.
