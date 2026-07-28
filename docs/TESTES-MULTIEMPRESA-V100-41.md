# Testes multiempresa — V100.41

O script `scripts/tenant_isolation_test.py` usa duas contas de homologação em organizações distintas.

Ele cria um lead temporário na organização A e confirma que a conta B:

- não visualiza a organização A;
- não visualiza o lead;
- não consegue alterar o lead;
- não modifica o dado original.

O registro temporário é removido ao final, inclusive em caso de falha quando possível.
