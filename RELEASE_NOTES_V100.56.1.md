# V100.56.1 — Hotfix & Runtime Reliability

Esta versão corrige regressões encontradas na V100.56.0 que podiam derrubar ou quebrar fluxos da Central de Ligações.

## Correções críticas

- Removida a última referência executável ao RealTalent Connect (`setConnectCommand`).
- Unificado o contrato de `CallWorkspaceModal`: todos os pontos de entrada agora entregam `CallSessionConfig`.
- Criado `buildQuickCallSessionConfig()` como fonte única para chamadas iniciadas por Leads, Dashboard, Agenda, Follow-ups e Pipeline.
- Corrigida a fila técnica de localização do Território: ela agora usa `locationQueue` transitório, sem depender de uma aba visual removida.
- Adicionada auditoria de contratos para impedir regressão para props legadas ou referências ao Connect.
- `npm run check` agora inclui a auditoria de contratos antes de typecheck/test/build.
- Adicionado boot guard: falhas antes da montagem do React deixam de virar tela branca silenciosa e passam a exibir diagnóstico de inicialização.

## Compatibilidade

- Nenhuma migration nova.
- Banco e dados da V100.56.0 permanecem compatíveis.
- O RealTalent Connect antigo continua removido do runtime.
