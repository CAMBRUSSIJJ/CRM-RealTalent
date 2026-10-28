# RealTalent Agent V5.1 — Ferramentas semânticas e segurança de planos

## Funcionalidades implementadas
- Seleção estruturada de ferramentas nativas com Ollama para pedidos compostos, limitada aos IDs cadastrados, com até oito etapas.
- Nenhuma ferramenta é executada pelo seletor. O executor original permanece responsável por escopo, permissões, confirmação, execução e readback.
- Validação de cobertura entre a seleção semântica e o plano final; a ausência de uma etapa bloqueia a execução em vez de apresentar sucesso parcial.
- Seletor com timeout e retorno controlado ao catálogo, sem escolher uma única ferramenta por coincidência lexical.
- Bloqueio do fallback local de ação única para pedidos com várias intenções.
- Preflight adicional de riscos, ferramentas, IDs e argumentos na própria interface antes de qualquer mutação.
- Testes unitários específicos de composição, casos de risco e planejamento.

## Arquitetura e limites
- É uma primeira implementação de seleção semântica estruturada, não um agente universal com livre execução de ferramentas.
- O planejar/operar existente ainda depende do runtime conectado e pode responder que não conseguiu preparar uma solicitação complexa.
- O Ollama local precisa receber a atualização dos arquivos em runtime-host para ativar a seleção semântica fora da prévia; a Vercel Preview compila o frontend, mas não comprova o novo gateway na infraestrutura Railway.
- A execução verifica operações através dos recibos e das regras atuais; determinadas ações têm readback parcial e não devem ser apresentadas como verificadas.
- Sem migração de dados ou alteração em produção.

## Plano para consolidar PRs
1. PR #1 (UI) a partir de release/rc1-h1-persistence-safety.
2. PR #2 (V4.0) sobre a branch de UI.
3. PR #3 (V4.1) sobre a branch V4.0.
4. PR #4 (V5.0) sobre V4.1.
5. PR V5.1 sobre V5.0.
6. Em vez de aplicar cinco merges cegamente, revisar o diff acumulado e rodar CI na candidata de release. Verificar migrations, segredos e serviços Railway antes de qualquer promoção. Não modificar main ou production sem revisão do deployment real.

## Critérios antes de produção
- Validar Ollama real no Railway/ambiente local.
- Testar CRUD com workspace descartável e autenticação, incluindo plano com duas ferramentas e falha no passo 2.
- Testar permissões por usuário, campo e empresa; confirmar ausência de acessos cruzados.
- Exercitar fluxos Firefox e Chromium em desktop e mobile; capturar logs e falhas de rede.
