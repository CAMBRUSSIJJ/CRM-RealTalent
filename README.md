# RealTalent CRM V101.11.3-H19.3 — WhatsApp Sales Workspace

Release sucessora direta da **V101.11.3-H19.2**, preservando o runtime omnichannel, QR/Cloud, Communications Gateway, realtime, identidade de contatos e 54 migrations. A H19.3 transforma o WhatsApp da Central de Comunicação em um workspace de execução comercial.

## V101.11.3-H19.3 — WhatsApp Sales Workspace

No chat WhatsApp, mensagens podem virar **Follow-up, Tarefa ou Nota**; o composer oferece respostas rápidas e compartilhamento da proposta vigente com Buyer Room; e cada conversa pode ser classificada como **Aguardando você**, **Aguardando cliente** ou **Resolvido**. O estado muda para Aguardando cliente após envio bem-sucedido e mensagens novas posteriores reinferem o estado da conversa.

O estado manual é persistido no `safeStorage` por workspace nesta release; ele ainda não é sincronizado por banco entre navegadores/dispositivos.

## V101.11.3-H19.2 — Communication Workspace & WhatsApp Connection Center

Comunicações é organizado por canal (**Caixa de entrada, WhatsApp, E-mail, Ligações e Atividades**) e por três áreas (**Conversas, Conversa e Contexto CRM**). O WhatsApp usa identidade RealTalent e o Connection Center permite operar QR local ou Cloud API sem sair do workspace.


## V101.11.3-H2 — Runtime Service Recovery

O recovery seguro de serviços agora cobre **Communications (3002) e RealTalent Connect (3001)**. O launcher só encerra processos reconhecidos da própria release ou de outra release RealTalent comprovadamente dona da porta alvo. Se uma porta pertencer a processo desconhecido, ele é preservado e o diagnóstico é mostrado.

Se Connect ou Communications continuarem indisponíveis, o CRM abre em **modo degradado**: apenas as funções dependentes daquele serviço ficam temporariamente indisponíveis.

## V101.11.3-H1 — Communications Gateway Recovery

O launcher agora detecta supervisors/gateways RealTalent antigos antes de abrir a porta 3002, encerra apenas processos reconhecidos de releases RealTalent, preserva processos desconhecidos e exibe PID/porta/log quando a recuperação não é possível. Se Communications continuar indisponível, o CRM abre em modo degradado em vez de encerrar toda a inicialização.

## Inicialização

```bash
# Linux
chmod +x start-linux.sh
./start-linux.sh

# qualquer plataforma com Node 22
npm run start
```

### Modos

```bash
npm run start       # rápido; reutiliza build aprovado
npm run start:dev   # desenvolvimento
npm run verify      # auditoria completa
npm run rebuild     # rebuild controlado
npm run doctor      # diagnóstico sem abrir a UI
npm run health      # consulta /health /readiness /status

./start-linux.sh --legacy  # fallback temporário para o launcher Bash da V101.10.7-H1
```

## Runtime local

- CRM: `127.0.0.1:4188`
- RealTalent Connect: `127.0.0.1:3001`
- Communications Gateway: `127.0.0.1:3002`
- Runtime Control: `127.0.0.1:3003`
- Prospecting Agent: `127.0.0.1:4319`


## CSS V101.10.9

O runtime agora usa folhas canônicas sem versão para os primeiros três domínios migrados:

- `src/styles/pipeline.css`
- `src/styles/followups.css`
- `src/styles/realtalent-connect.css`

Os arquivos históricos permanecem no repositório apenas para auditoria/rollback. `npm run css:governance` bloqueia crescimento silencioso da dívida de CSS versionado.

## RealTalent Connect

O padrão agora é:

```text
RealTalent Connect
● Apenas este computador

[ Permitir celular na rede local ]
```

O listener CRM fica em `127.0.0.1`. A porta só é aberta para uma interface privada da LAN depois da ação explícita em **Configurações → Ligações**. O pareamento usa código de 6 dígitos com expiração e limite de tentativas.

## Communications Gateway

As chamadas internas usam proxy local autenticado por token de runtime gerado pelo launcher. Webhooks WhatsApp operam em modo fail-closed: configuração incompleta não aceita evento externo silenciosamente.

## Atualização da V101.10.8

Se a pasta anterior estiver ao lado da nova pasta, o launcher prioriza a V101.10.8 para preservar dados locais compatíveis, sessão/configuração de comunicações e histórico/fila do Garimpo. As versões V101.10.7-H1 e V101.10.6-H2 permanecem como fallbacks de migração.

## Notas e QA

- `RELEASE_NOTES_V101.10.9.md`
- `QA_REPORT_V101.10.9.txt`
- `docs/qa/CSS_INVENTORY_V101.10.9.md`

## Linhagem preservada

A release mantém a cadeia V101.x validada pelos gates de regressão e os marcos históricos **V100.92.0 — Hardening & UX** e **V100.93.0 — Full Page UX Audit**.

## Histórico de compatibilidade preservado

# RealTalent CRM V100.94.0 — Omnichannel Inbox
# RealTalent CRM V100.95.0 — Workspace Personalization

Marcos anteriores preservados: V100.92.0 — Hardening & UX; V100.93.0 — Full Page UX Audit.
