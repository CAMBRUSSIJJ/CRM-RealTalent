# RealTalent CRM V101.11.3-H19.11 — WhatsApp Contact & Message Normalization

Base: V101.11.3-H19.10-H1 — Media Delivery Fix

## Objetivo

Normalizar os dados entregues pela sessão WhatsApp antes de renderizá-los no CRM. A release elimina payloads binários e eventos de protocolo da conversa, melhora voz/mídia, separa pessoas de grupos e cria uma agenda WhatsApp vinculável ao CRM.

## Adicionado

- Agenda **Contatos do WhatsApp**, carregada da sessão QR via `client.getContacts()`.
- Ações individuais **Salvar no CRM** / **Abrir no CRM**; nenhum contato é importado em massa automaticamente.
- Resolução de identidade por telefone com prioridade para nome CRM, nome conhecido da sessão WhatsApp e, por último, número formatado.
- Filtros de inbox: **Todas / Pessoas / Grupos / Não lidas**.
- Informações de grupo sob demanda ao clicar no cabeçalho: descrição, quantidade de participantes e indicação de administradores.
- Player RealTalent de áudio/voz com play/pause, progresso e velocidades 1x / 1.5x / 2x.
- Gravação de voz com cronômetro, cancelar, parar e preview antes do envio.

## Corrigido

- `data:*;base64,...` e blocos longos de Base64 deixam de ser tratados como corpo textual de mensagem.
- O Gateway também sanitiza o `body` no envio para impedir que payload binário seja enviado como texto mesmo se um cliente produzir entrada incorreta.
- Eventos `e2e_notification`, `protocol`, `ciphertext`, `history_sync_notification`, notificações e eventos técnicos equivalentes deixam de criar mensagens, conversas ou não-lidas.
- Stickers, imagens, vídeos, áudio/voz e documentos mantêm tipo de mídia na ingestão.
- Nomes genéricos como `WhatsApp` e números crus deixam de ganhar prioridade quando existe identidade melhor disponível.
- A timeline filtra eventos técnicos e payload codificado também ao carregar histórico já persistido.

## Contatos do celular

A sessão QR não concede acesso irrestrito à agenda nativa do iPhone/Android. A H19.11 sincroniza os contatos que a **sessão WhatsApp Web conhece**. A partir dessa agenda, o usuário escolhe quais pessoas devem virar contatos comerciais no RealTalent. Para sincronização integral da agenda nativa, será necessária integração específica (por exemplo Google Contacts/Microsoft Contacts/vCard ou aplicativo móvel).

## Preservado

- H19.7 Pure Chat: proposta, follow-up, tarefa e outros controles comerciais não retornam ao corpo do chat.
- H19.8 Control Center e H19.8-H1 Runtime Recovery.
- H19.9 idempotência, criação de contato e grupo.
- H19.10 rich messaging, fila offline, ACK, mídia e reply.
- H19.10-H1 Media Delivery Fix.

## QA

- `qa:architecture`: PASS.
- H19.11: 50/50.
- Normalization smoke: 8/8.
- Source syntax: 414 arquivos.
- Integration contracts: 382 arquivos.
- Migrations: 54/54.
- Release manifest: 90/90.
- Capability Matrix: 40 capacidades / 141 evidências / 95 executáveis.
- Repository Local/Supabase: 100/100 cada.
- Browser E2E contracts: 11 fluxos.
- CSS Governance: 65/65.
- Linux preflight: 375 TS/TSX.
- Rich Messaging runtime: 7/7.
- Media Delivery Fix runtime: 7/7.
- WhatsApp Runtime Recovery: 5/5.
- Communications Architecture: 6/6.
- Communications Recovery: 5/5.
- Connect Recovery: 5/5.
- Security Runtime: 12/12.

## Gates dependentes de node_modules

`npm ci` não completou dentro do limite porque o registry npm não respondeu. Sem as dependências instaladas:

- `typecheck`: BLOCKED (React/Supabase e tipos não instalados);
- `vitest`: BLOCKED (`vitest: not found`);
- `vite build`: `validate:env` PASS e depois BLOCKED (`vite: not found`).

O build independente transpila 299 módulos, mas gera o HTML legado/CDN; o auditor o rejeitou corretamente e `dist/` não faz parte do ZIP final.
