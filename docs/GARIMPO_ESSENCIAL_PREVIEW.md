# Garimpo Essencial — Preview sem IA (17/11/2026)

## O que esta entrega realmente faz

- Seleção por pesquisa **Essencial (sem IA)** ou **Inteligente (IA opcional)** na busca principal.
- Usa a pesquisa pública atual do Firecrawl/SearXNG e a cobertura territorial já existente (quando disponível).
- Extrai candidatos de páginas de resultados com um worker **Python 3 sem dependências externas e sem acesso à rede**. O worker recebe somente textos públicos; o processo Node revalida os campos contra URL e texto efetivamente coletados.
- Se Python estiver ausente, expirar ou falhar, utiliza uma extração JavaScript conservadora. Não chama o Ollama/Gemini no modo Essencial.
- Preserva a revisão humana obrigatória e não aprova, não envia mensagens, nem transfere empresas automaticamente ao CRM.
- Apresenta o mapa como visualização opcional para evitar a grande área vazia da tela inicial.
- O configurador Linux não exige Ollama para iniciar o modo Essencial.

## Arquitetura (execução local)

Vercel (interface CRM) -> Supabase (fila por workspace) -> conector Node no Linux
-> Firecrawl/SearXNG (descoberta de fontes) -> Python sem IA (extração)
-> validador de evidências do CRM -> fila Supabase -> revisão no CRM.

O Python não é um crawler autônomo: a busca e o controle de URLs continuam no gateway Firecrawl/Node. A descoberta não cria empresas se a fonte não contiver informações suficientemente atribuíveis.

## Uso

1. No Preview, abra Garimpo > Busca e escolha **Essencial · sem IA**.
2. Configure segmento e cidade; carregue o mapa só se precisar visualizá-lo.
3. Conecte o Linux e mantenha Firecrawl/SearXNG e o conector ativos durante a busca. Não é preciso ligar o Ollama.
4. Selecione **Buscar empresas**; confira empresas em **Revisar**. Campos ausentes ficam em branco.
5. Mude para **Inteligente** apenas quando quiser análise com modelo configurado.

O instalador deve conter os arquivos `essential_worker.py`, `essential-python.mjs`,
`essential-research.mjs` e as versões atualizadas do conector. Um Preview no navegador,
sozinho, **não atualiza o conector Linux já instalado**.

## Diagnóstico

- **Linux desconectado**: serviço local ou comunicação com a fila indisponível; a Vercel não pode executar seu Python localmente.
- **Nenhum resultado**: não foram encontradas fontes com identidade e cidade suficientes; não significa ausência de empresas.
- **Atenção**: alguma etapa não terminou; consulte diagnóstico e logs locais. Pesquisa territorial funciona apenas se o agente de território estiver ativo.
- **Python indisponível**: o conector usa extração JavaScript (sem IA).
- **Modo Inteligente sem modelo**: retorna apenas dados extraídos, com aviso, sem tentar inventar hipóteses.

## Testes e limites

- `cd deploy/local-garimpo && npm test` (inclui contrato do modo Essencial).
- `python3 -m py_compile deploy/local-garimpo/essential_worker.py`.
- `npm run typecheck && npm run build` na raiz.

Limites deliberados:
- O extrator trabalha com um candidato conservador por resultado público, sujeito à confirmação do revisor. Atributos comerciais complexos permanecem em G7/G8.
- Não navega em login privado, não usa APIs pagas e não infere faturamento, intenção de compra, CNPJ ou WhatsApp.
- Não garante quantidade de resultados nem cobertura completa de um território. O mapa não comprova cobertura até o agente geográfico concluir.
- A execução hospedada 24/7, cobrança, quotas contratuais, painel multi-inquilino e conformidade operacional para venda ainda **não estão implementadas**; requerem worker independente, isolamento e monitoramento.
- O G8 permanece em uma branch de desenvolvimento separada; não deve ser misturado à branch Gemini sem revisão de conflito e regressão.

## Preparação comercial sugerida

Separar planos por uso e limites mensais, operar um worker próprio para clientes que
não desejam instalar serviços, aplicar limites por workspace, autorização/retensão de
dados, gestão de segredos, observabilidade e cancelamento de tarefas. Validar a origem
e os termos de cada fonte pública, LGPD e regras de contato antes da oferta. Pilotos
devem medir cobertura, correspondência territorial, taxa de contatos verificáveis,
latência, custos por pesquisa e conversão em oportunidades **sem atribuir causalidade
à IA**. Não utilizar dados de clientes de produção em demonstrações.
