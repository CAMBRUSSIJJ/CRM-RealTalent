# RealTalent CRM V100.45

Release de **Fundação de Integrações**. A V100.45 transforma o framework novo na única central oficial e consolida segurança, permissões, workers, filas e diagnóstico.

## Entregas principais

- central antiga removida da interface e histórico migrado para auditoria;
- modo local identificado como demonstração, sem simular conexão real;
- contas pessoais, compartilhadas, organizacionais e restritas;
- OAuth com PKCE S256 e estado persistido de uso único;
- renovação, rotação e revogação de tokens no cofre;
- workers separados para Google, Microsoft, Meta, WhatsApp, saúde e credenciais;
- allowlist de trabalhos por provedor;
- leases e recuperação automática de filas travadas;
- validação completa de secrets no deploy;
- teste real de conexão e diagnóstico por integração;
- painel de capacidades e auditoria operacional persistente;
- revogação no provedor, callback OAuth correto no gateway e webhook do WhatsApp com validação HMAC;
- escrita direta do frontend em contas conectadas bloqueada;
- ingestão da extensão sem dependência das tabelas antigas.

## Validação

```bash
npm ci
npm run homologate
```

Sem acesso ao registro npm:

```bash
npm run homologate:portable
```
