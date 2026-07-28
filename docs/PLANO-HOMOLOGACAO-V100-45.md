# Plano de homologação — V100.45

## Fluxos obrigatórios

1. Confirmar que a interface renderiza somente a central nova de integrações.
2. Validar que o modo local cria contas de demonstração sem classificá-las como conectadas.
3. Conectar uma conta OAuth e confirmar PKCE, estado de uso único e consumo único do callback.
4. Forçar expiração do access token e validar renovação, rotação no cofre e auditoria.
5. Desconectar uma conta e validar revogação, remoção do token ativo e bloqueio de novos trabalhos.
6. Testar contas pessoais, compartilhadas, organizacionais e restritas com usuários autorizados e não autorizados.
7. Confirmar que cada worker captura apenas os tipos permitidos para seu provedor.
8. Simular queda durante processamento e validar recuperação do lease vencido.
9. Executar “Testar conexão” e confirmar chamada real ao provedor, latência e resultado auditado.
10. Executar diagnóstico por integração e validar secrets, credenciais, acesso, filas e validade do token.
11. Confirmar que Gmail usa Pub/Sub e Google Calendar usa canal próprio.
12. Executar auditorias de sintaxe, banco, integrações, extensões, Connect, backup e release.
