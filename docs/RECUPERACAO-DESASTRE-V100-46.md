# Recuperação de desastre — V100.46

1. Restaure o banco usando o backup técnico seguro e confirme a migration lock.
2. Reconfigure os secrets OAuth e de workers; tokens não devem ser recuperados por exportação de usuário.
3. Publique as Edge Functions e configure o cron dos workers.
4. Reautorize contas Google/Microsoft quando o cofre não puder ser restaurado com segurança.
5. Recrie Gmail watch, canais do Google Calendar e subscriptions Microsoft.
6. Execute sincronização completa inicial antes de reativar automações comerciais.
7. Valide timeline, cursores, defaults, anexos e conflitos em staging.
