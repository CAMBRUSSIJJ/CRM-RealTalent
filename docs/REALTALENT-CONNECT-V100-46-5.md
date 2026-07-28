# RealTalent Connect — contrato V100.46.5

O CRM cria um comando em `realtalent_connect_call_commands`. O aplicativo conectado consulta `claim_realtalent_connect_call_commands`, inicia a chamada e atualiza o comando por `update_realtalent_connect_call_command`.

Estados válidos:

`queued → claimed → dialing → connected → completed`

Saídas alternativas: `failed`, `cancelled` e `expired`.

Regras:

- somente o proprietário do dispositivo ou administrador pode utilizá-lo;
- o dispositivo precisa estar conectado e com heartbeat recente;
- somente uma chamada ativa é permitida por dispositivo;
- telefone e identificadores são validados no servidor;
- o CRM acompanha o estado por polling e oferece fallback `tel:` quando não há dispositivo.
