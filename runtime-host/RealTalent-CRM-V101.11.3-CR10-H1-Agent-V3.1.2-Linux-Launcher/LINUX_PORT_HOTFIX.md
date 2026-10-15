# Linux browser port hotfix

A V101.5.6 originalmente usava a porta local 4190. O Firefox bloqueia essa porta porque ela é reservada para outro protocolo de rede (ManageSieve), exibindo a mensagem de endereço restrito.

O launcher Linux deste pacote foi corrigido para usar a porta **4188** por padrão.

Execute normalmente:

```bash
./start-linux.sh
```

O CRM abrirá em:

```text
http://127.0.0.1:4188/?rt_release=101.5.6-visual-consistency-hotfix
```

Você ainda pode escolher outra porta segura manualmente:

```bash
PORT=5173 ./start-linux.sh
```

## QA histórico corrigido
O gate `V101.5.5 Visual System Rollout` foi atualizado para aceitar a porta segura 4188 da V101.5.6. O contrato anterior exigia `default_port >= 4189`, o que rejeitava indevidamente a correção de compatibilidade com Firefox.

Validação após a correção:
- V101.5.5 Visual System Rollout: 15/15
- V101.5.6 Visual Consistency Hotfix: 18/18
- 59/59 gates históricos e atuais aprovados
