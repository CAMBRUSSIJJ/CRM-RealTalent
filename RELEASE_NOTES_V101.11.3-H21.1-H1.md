# RealTalent CRM V101.11.3-H21.1-H1 — Communication Lineage Guard Fix

Base: V101.11.3-H21.1 — Garimpo Coverage & Runtime Truth.

## Problema corrigido

O launcher ainda exigia literalmente o marker legado da H19.11:

`whatsapp-inbox-create-actions is-h1911`

A H20.7-H2 evoluiu legitimamente esse bloco para:

`whatsapp-inbox-create-actions is-h207h2`

Por isso o preflight produzia um falso erro de regressão mesmo com a Central correta e com os três comandos de inbox preservados.

## Correção

O guard de lineage agora aceita qualquer um dos dois markers como sucessores válidos da mesma capacidade:

- `is-h1911` — marker histórico H19.11;
- `is-h207h2` — marker atual da Inbox simplificada H20.7-H2.

Os demais requisitos continuam obrigatórios: Pure Chat H19.7, Continuous Chat H19.8, `WhatsAppChatPanel` e `communication-channel-switch`.

O hotfix não recoloca Trabalho/Etiquetas na coluna esquerda e não reintroduz a Central antiga.

## Marker de runtime

`rt_launcher_fix=101.11.3-h21-1-h1-communication-lineage-guard`

## Validação

- H21.1-H1 Lineage Guard: 15/15 PASS
- H19.12 Lineage Recovery: 19/19 PASS
- H20.7-H2 Conversation-Only Inbox: 24/24 PASS
- H21.1 Garimpo Coverage & Runtime Truth: 33/33 PASS
- Release Manifest: 101/101 PASS
- `qa:architecture`: PASS
- `node --check scripts/start.mjs`: PASS

Nenhuma migration nova e nenhuma alteração funcional no Garimpo/WhatsApp.
