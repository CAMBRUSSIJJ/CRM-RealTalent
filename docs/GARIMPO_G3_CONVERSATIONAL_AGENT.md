# RealTalent Garimpo Intelligence — G3 Conversacional

## Fluxo
A aba Buscar e a aba Revisar incluem o painel compacto "Converse com o Garimpo".
O Qwen3 8B interpreta a intenção e usa ferramentas existentes da plataforma.
Não foi criada uma segunda base nem um motor paralelo de prospecção.

- Search: identifica segmento, cidade e quantidade, apresenta uma proposta e exige clique em "Iniciar busca". A execução usa createProspectingAgentJob, com as permissões existentes.
- Rank: ordena as empresas disponíveis por rankProspects e explica os três indicadores G2. Nunca inventa probabilidades de compra.
- Review: abre a Revisão existente sem aprovar empresas.
- Answer/Clarify: mantém o contexto dos últimos turnos e esclarece dados faltantes.

## Segurança e limites
- Endpoint local POST /tools/garimpo-conversation; usa somente Ollama em loopback.
- Somente prompt, contexto de pesquisa, contagem agregada e histórico limitado são enviados ao modelo. Nenhum e-mail, telefone, nota privada ou ID de cliente é transmitido.
- Mapas desenhados não são movidos para outra cidade automaticamente.
- A IA não aprova registros, não envia ao CRM, não descarta, não exclui e não cria campanhas recorrentes.
- A busca efetiva depende do serviço de Garimpo; o chat não simula resultados.
- A conversa só permanece na sessão da interface e não é salva em banco.
- A investigação G1 e a pontuação G2 permanecem independentes.

## Validação
Workflow: .github/workflows/garimpo-g1g2-qa.yml
Inclui TypeScript, Node G1/G3, Vitest, sintaxe do gateway e build.
É necessária validação com Ollama, Firefox e busca territorial reais no computador do usuário.
Não publicar em Production antes de concluir a QA de ponta a ponta.

## Instalação
Branch: feat/realtalent-garimpo-g3-conversational-20261028
Inicializador: scripts/garimpo-g1g2-linux/abrir-com-diagnostico.sh
CRM local: http://127.0.0.1:4197
Gateway local: http://127.0.0.1:8804

## Teste funcional
1. "Encontre 40 empresas de jardinagem em Rio Grande": deve propor busca antes de executá-la.
2. Confirmar: deve abrir um job real no motor territorial.
3. "Quais merecem atenção?": deve mostrar ranking de dados reais já disponíveis.
4. "Abra a revisão": deve abrir a aba Revisar, sem aprovar nem enviar.
5. Escolher nova cidade com mapa poligonal desenhado: deve bloquear troca silenciosa.
6. Parar Ollama: deve informar indisponibilidade, sem pesquisas fictícias.
7. Perfil somente leitura: consulta permitida, mas não pode iniciar busca.
