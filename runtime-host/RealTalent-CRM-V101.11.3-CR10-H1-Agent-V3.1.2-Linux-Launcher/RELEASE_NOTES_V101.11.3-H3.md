# V101.11.3-H3 — Calling Workspace 2.0

Hotfix de experiência operacional sobre a **V101.11.3-H2 — Runtime Service Recovery**. Mantém o recovery seguro de Communications/Connect e não altera schema ou migrations.

## Adicionado

- **Pré-call Intelligence aberto antes da discagem**: última interação, situação comercial, próxima ação, pessoas da conta, histórico recente, notas, dados do contato e objeções anteriores ficam visíveis antes de ligar.
- **Metas conectadas à operação**: preparação e sessão exibem progresso de metas ativas de ligações, contatos, reuniões e propostas e permitem abrir a aba Metas. O progresso continua derivado dos resultados reais salvos no CRM.
- **Objection Capture**: objeções podem ser registradas durante a conversa, marcadas como em aberto/contornada/permaneceu, complementadas com a resposta real do lead e persistidas no histórico da chamada.
- **Objeção livre**: além das objeções do Playbook, o vendedor pode registrar uma objeção em texto quando ela não estiver catalogada.
- **Roteiro em três visualizações**: Guiado, Completo e Mapa da conversa, mantendo a mesma etapa corrente e navegação.
- **Wrap-up 2.0**: resultado principal e resultado específico foram separados; o vendedor mantém analytics estruturado e pode complementar o motivo/contexto por escrito.
- persistência/recovery de `scriptView`, objeções capturadas e detalhe do resultado durante tentativa não salva.

## Melhorado

- controles Focus/Power deixam de comprimir título e descrição e passam a respeitar geometria consistente;
- chips, escolhas, tabs e controles da área Calling recebem click targets e hierarquia visual mais coerentes;
- a informação necessária antes da ligação deixa de ficar escondida atrás de um accordion;
- a captura de objeção passa a alimentar o mesmo texto estruturado consumido pela inteligência/coaching legado;
- metas deixam de ser apenas contador de sessão e ganham ligação explícita com a área Metas.

## Preservado

- V101.11.3 Actionable Pipeline Experience;
- H1 Communications Gateway Recovery;
- H2 Runtime Service Recovery / RealTalent Connect;
- Calling Voice/Dialer/One-Tap;
- Playbooks e Calling Intelligence existentes;
- 50 migrations e contratos de repository.

## Sem alteração deliberada

- nenhum schema novo;
- nenhuma migration nova;
- nenhum novo provider de telefonia;
- nenhuma mudança global no Design System fora do escopo Calling.
