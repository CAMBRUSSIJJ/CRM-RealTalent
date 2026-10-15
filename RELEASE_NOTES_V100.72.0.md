# RealTalent CRM V100.72.0 — Calling Intelligence Workspace

A V100.72 transforma a inteligência de ligações em uma camada operacional dentro do fluxo existente, sem criar novas abas principais e sem substituir a decisão do vendedor.

## Entregas

### Pré-call Brief
- Contexto do contato, empresa, etapa e oportunidade antes da discagem.
- Última interação consolidada entre chamadas e atividades.
- Sinais anteriores encontrados no histórico.
- Pergunta de abertura recomendada de acordo com o objetivo e o histórico.

### Call Health
- Validação de formato do telefone e permissão de contato.
- Detecção de opt-out / não contatar.
- Frequência de tentativas em 72h e 7 dias.
- Aviso de contato já realizado no dia, telefone duplicado e reunião futura.
- Score operacional 0–100 e recomendação de ação.
- Contatos restritos não entram automaticamente na sessão e não podem abrir o discador.

### Next Best Question
- Usa lacunas do Discovery Checklist e sinais da conversa para recomendar a próxima pergunta.
- Prioriza problema, processo atual, impacto, decisão, timing, investimento e próximo passo.
- A recomendação muda conforme as informações são registradas.

### Live Conversation Signals
- Analisa localmente notas e transcrição do navegador.
- Detecta dor, impacto, concorrente, decisão, orçamento, timing, solução atual, interesse, preço, objeção e próximo passo.
- Mostra sinais ao vivo no Modo Foco e permite registrá-los nas notas.
- Sinais detectados entram no wrap-up salvo da ligação.

## Arquitetura

A análise desta versão é determinística e local. Não chama provedor externo de IA e não envia transcrição para serviço adicional. A estrutura foi criada como uma camada de serviço isolada para permitir uma futura evolução para provedores de inteligência sem acoplar a UI.

## Compatibilidade

- Mantém V100.70 Call Preparation Workspace.
- Mantém V100.71 Calling UI Standardization.
- Não altera o schema de backup (`100.54`).
- Não adiciona migrations de banco.
