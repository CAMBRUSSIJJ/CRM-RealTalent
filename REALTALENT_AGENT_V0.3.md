# RealTalent Agent V0.3 — Browser + QA Agent no CRM

A V0.3 preserva as 6 Agent Tools da V0.2 e adiciona verificação visual pós-execução.

## Fluxo
1. OpenAI propõe uma ação permitida.
2. CRM revalida IDs/permissões e pede confirmação.
3. CRM executa a ação.
4. Usuário pode clicar em **Verificar na interface**.
5. Browser QA conecta ao Chromium gerenciado na mesma sessão (CDP loopback 9223).
6. QA observa screenshot/texto/console/rede, navega sem escrever no modo `observe` e retorna PASS/FAIL/NEEDS_USER/UNKNOWN.

## Garantias
- QA não recebe cookies/tokens diretamente.
- QA não digita credenciais.
- Verificação pós-ação usa `mode=observe`.
- Navegação fora do app local é bloqueada.
- Nenhuma ação destrutiva foi adicionada.
