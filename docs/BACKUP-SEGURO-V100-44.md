# Backup seguro — V100.44

O modo padrão `safe` preserva dados comerciais e configurações não sensíveis, mas exclui o conteúdo de cofres de tokens, credenciais de integrações, estados OAuth, segredos de webhooks, convites e tokens de ingestão.

O modo `technical` é destinado apenas à recuperação controlada de infraestrutura e exige `ALLOW_SENSITIVE_BACKUP=true`. A restauração de um backup técnico exige `ALLOW_SENSITIVE_RESTORE=true`. Ambos os modos geram checksum e manifesto.

Credenciais nunca devem ser entregues em exportações de workspace destinadas ao usuário final.
