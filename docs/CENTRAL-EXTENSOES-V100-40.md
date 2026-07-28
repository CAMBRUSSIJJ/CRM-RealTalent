# Central de Extensões — V100.40

A Central de Extensões fica em **Configurações → Integrações → Extensões** e administra produtos de navegador da RealTalent sem criar uma nova área comercial na sidebar.

## Recursos

- instalações vinculadas a organização e usuário;
- versão, navegador, plataforma e última atividade;
- pausa, reativação e revogação;
- configuração remota por produto;
- destino Garimpo ou Leads;
- política de duplicidade;
- fontes permitidas e tamanho máximo de lote;
- versão mínima e recomendada;
- fila idempotente de capturas;
- tentativas, falhas e dead-letter;
- eventos e correlação de lotes;
- isolamento por RLS;
- compatibilidade temporária com o token legado da extensão.

## Integração da extensão

O diretório `extension-sdk/` contém o cliente de referência para Manifest V3. A extensão deve:

1. autenticar o usuário no RealTalent;
2. registrar sua instalação em `extension-register`;
3. enviar heartbeat periódico;
4. aplicar a configuração remota;
5. enviar lotes a `extension-ingest` com ID idempotente;
6. manter uma fila local quando estiver offline;
7. interromper o envio quando pausada, revogada ou desatualizada.

## Segurança

A extensão nunca recebe `service_role`, secrets de servidor ou acesso administrativo. Operações do usuário usam JWT e RLS. O endpoint de ingestão usa uma credencial de integração limitada, validada e isolada por organização.
