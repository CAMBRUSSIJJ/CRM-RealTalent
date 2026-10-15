# V101.11.3-H19.12 — Communication Workspace Lineage Recovery

Base direta: V101.11.3-H19.11.

## Corrigido
- restaura e preserva a linhagem visual/funcional H19.7 → H19.11;
- impede que a Central antiga de três colunas fixas volte a ser tratada como release atual;
- valida no launcher a presença de Pure Chat, channel switch e inbox H19.11 antes de iniciar;
- remove risco de um preview RealTalent antigo na porta 4188 mascarar a UI atual: o launcher identifica e encerra somente Vite/RealTalent reconhecido;
- processos desconhecidos na porta 4188 são preservados e o launcher falha fechado com diagnóstico.

## Preservado
- WhatsApp Pure Chat e canvas contínuo;
- Connection Center/QR/Cloud;
- pessoas, grupos e agenda WhatsApp;
- mídia rica, voz, reply, ACK, outbox/retry;
- normalização H19.11;
- E-mail dedicado e restante do CRM.

## Sinais de que a UI correta está aberta
- URL contém `rt_ui=101.11.3-h19-12-communication-workspace-lineage-recovery`;
- workspace principal usa Conversas + Chat contínuo;
- não existe rail fixo `Contexto CRM` como terceira coluna;
- respostas rápidas, proposta, follow-up e nota não voltam ao corpo do WhatsApp;
- contexto do lead abre sob demanda em drawer;
- WhatsApp/E-mail permanecem no channel switch.

## Artefato substituído
`RealTalent-CRM-V101.11.3-H19-Communications-3-Linux-Launcher.zip` não deve ser usado como base posterior à H19.11 porque reintroduz a Central antiga.
