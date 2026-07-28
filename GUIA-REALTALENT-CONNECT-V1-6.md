# Guia de conexão — RealTalent CRM V100.39 e Connect Desktop v1.6

## 1. Homologar o CRM

1. Faça backup do Supabase.
2. Aplique as migrations em ordem, incluindo `202607230004_v100_39_connect_desktop.sql`.
3. Confirme que a migration do Motor Comercial V100.34 já está aplicada.
4. Execute `npm run audit:database` e `npm run audit:connect`.
5. Publique o CRM TypeScript em homologação antes de produção.

## 2. Preparar o Connect

1. Use Windows com Node.js 22 ou superior.
2. Extraia a pasta `RealTalent-Connect-Desktop-v1.6`.
3. Execute `INSTALAR-E-ABRIR-V1.6.bat`.
4. Para distribuir, execute `GERAR-INSTALADOR-V1.6.bat`.

## 3. Vincular

1. No Connect, abra **Integração CRM**.
2. Informe a URL do Supabase, a chave pública anon, o e-mail e a senha do vendedor.
3. Clique em **Vincular aplicativo**.
4. Clique em **Atualizar fila e playbooks**.
5. No CRM, confira o computador em **Configurações → Integrações → RealTalent Connect**.

## 4. Fluxo de ligação

1. A fila é recebida do CRM.
2. A chamada é aberta pelo protocolo `tel:` do Windows e pelo Vincular ao Celular.
3. O resultado é salvo primeiro no SQLite.
4. A fila offline chama `register_commercial_call_outcome`.
5. Histórico, Pipeline, Agenda, Follow-up e próxima ação são atualizados na mesma transação.

## 5. Segurança

- Nunca coloque `service_role` no Connect.
- Tokens ficam no `safeStorage` do Windows.
- O bucket `crm-recordings` é privado e protegido por organização.
- Gravações exigem consentimento registrado.
- Dispositivos pausados ou revogados não conseguem registrar heartbeat ou reconectar automaticamente.

## Limite da ligação móvel

O Connect não controla diretamente Bluetooth ou iPhone. Ele envia o telefone ao protocolo `tel:`; a execução da chamada continua dependendo do Windows e do aplicativo Vincular ao Celular.
