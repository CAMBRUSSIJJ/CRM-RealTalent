# Matriz de permissões para homologação

| Ação | Proprietário | Administrador | Vendedor | Visualizador |
|---|---:|---:|---:|---:|
| Ver dados da organização | Sim | Sim | Sim | Sim |
| Criar e editar leads | Sim | Sim | Sim | Não |
| Excluir leads | Sim | Sim | Conforme política | Não |
| Mover Pipeline | Sim | Sim | Sim | Não |
| Registrar atividades | Sim | Sim | Sim | Não |
| Configurar etapas e metas | Sim | Sim | Não | Não |
| Criar automações/webhooks | Sim | Sim | Não | Não |
| Exportar dados | Sim | Sim | Conforme política | Não |
| Gerenciar usuários | Sim | Sim | Não | Não |
| Ver auditoria | Sim | Sim | Não | Não |

A enumeração atual do banco usa `owner`, `admin`, `member` e `viewer`. Na interface comercial, `member` corresponde ao vendedor. A homologação deve comprovar isolamento entre organizações e bloqueio de escrita para `viewer`.
