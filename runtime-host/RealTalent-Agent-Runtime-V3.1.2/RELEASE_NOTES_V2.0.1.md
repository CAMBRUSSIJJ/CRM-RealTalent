# RealTalent Agent V2.0.1 — Chat Reliability Hotfix

## Corrigido
- Composer do `/chat` deixa de depender de posicionamento absoluto e permanece visível no fluxo da página.
- Perguntas conceituais novas não herdam contexto antigo apenas por compartilhar uma palavra com o turno anterior.
- `como posso me amar?` é resolvido explicitamente como pergunta da pessoa usuária sobre si mesma.
- `o que é amar?` é tratado como definição conceitual, não como pergunta sobre a capacidade da IA de amar.
- Perspective Guard valida a resposta local; se o modelo 3B confundir usuário e Agent, faz uma segunda geração com contexto limpo.
- Fallback seguro cobre os dois padrões críticos de amor próprio/definição caso o modelo insista na interpretação errada.

## Segurança
- Builder, QA, Project Brain, Governance e checkpoints da V2.0 permanecem inalterados.
- Nenhuma autonomia adicional foi adicionada.
