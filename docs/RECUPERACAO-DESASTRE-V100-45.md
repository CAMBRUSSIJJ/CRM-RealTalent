# Recuperação de desastre — V100.45

1. Restaurar o banco a partir de backup validado e conferir o manifesto de migrations.
2. Reaplicar secrets por cofre seguro; nunca restaurá-los por exportação de workspace.
3. Validar a chave de criptografia antes de reativar workers.
4. Executar o diagnóstico de todas as integrações com workers pausados.
5. Reautorizar contas cujo refresh token não possa ser recuperado com segurança.
6. Recriar subscriptions, canais e watches dos provedores.
7. Recuperar leases vencidos e revisar a dead-letter antes de liberar o processamento.
8. Executar teste de conexão por conta e auditoria de permissões.
9. Liberar workers por provedor gradualmente e acompanhar erros, latência e duplicidades.
10. Executar homologação completa e gerar novo manifesto de release.
