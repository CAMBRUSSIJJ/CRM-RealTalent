# RealTalent Agent V0.3 — Browser + QA Agent

## Adicionado
- Chromium gerenciado com perfil dedicado por produto.
- CDP loopback: CRM `9223`, Blue Ocean `9224`.
- Browser QA com Playwright conectado à mesma sessão do usuário.
- Loop visual screenshot → GPT → ação semântica → nova evidência.
- Ações limitadas: click por texto/role, navegação local, scroll, teclas seguras; fill apenas em sandbox não sensível.
- Verificador explícito PASS / FAIL / NEEDS_USER / UNKNOWN.
- Captura de console errors, page errors, request failures e screenshots por passo.
- Painel local em `http://127.0.0.1:8791/qa`.
- Jobs assíncronos de QA e cancelamento.
- Self-test Playwright/Chromium sem OpenAI.

## Preservado
- 6 Agent Tools do CRM.
- 7 Agent Tools do Blue Ocean.
- Confirmação humana antes de mutações de negócio.

## Não incluído ainda
- Edição autônoma de código-fonte.
- Terminal autônomo para correções.
- Aprovação automática de mudanças destrutivas.
