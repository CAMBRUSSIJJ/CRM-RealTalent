# Garimpo Python nativo — uso real no CRM

## O que foi corrigido

O Preview do CRM já recebia buscas, mas o worker Node/Firecrawl encerrava
trabalhos como `local_research_failed`. A autenticação por workspace e a fila
do Supabase continuavam funcionando. O novo fluxo remove a dependência de Node,
Docker e Ollama **para descoberta básica de empresas**.

**Preview → Edge Function de fila existente → worker Python no Linux →
motor Garimpo 0.6 → Maps com expansão por áreas + coleta nos sites → revisão no CRM.**

A pesquisa é iniciada pelo botão **Buscar empresas**. O Python consulta fontes
públicas e devolve registros com nome e evidência, além de telefone, site,
e-mail e endereço somente quando publicados. Os registros entram na revisão,
não são enviados automaticamente ao Pipeline nem pelo WhatsApp.

## Como instalar

1. No Preview do RealTalent, Garimpo → Busca → **Gerenciar conexão Linux** →
   **Gerar comando do novo motor**. Autorize a nova credencial do workspace.
2. Finalize o terminal do conector antigo (ou pare o serviço Linux antigo) antes
   de iniciar o novo. A nova credencial revoga a anterior.
3. Copie o comando privado recém-gerado no terminal Linux. **Não envie esse
   comando, capturas dele ou o arquivo `garimpo.env` para terceiros.**
4. O instalador prepara a pasta nova
   `~/Downloads/RealTalent-Garimpo-Python-v06`, executa testes offline, instala o coletor verificado e o Chromium
   e inicia o Python em primeiro plano. As instalações existentes não são apagadas.
5. De volta ao Preview, aguarde o status **Linux conectado**, selecione
   **Essencial · sem IA** e pesquise por **Barbearia — Rio Grande, RS**.
6. Verifique **Revisar** e confira as URLs das fontes. Se algum provedor
   estiver indisponível, o resultado exibe um aviso específico.

O computador precisa continuar ligado e conectado para receber pesquisas.
Python 3.12 ou superior e suporte a `python3-venv` são necessários. O instalador usa um ambiente Python isolado, verifica o SHA-256 do coletor e testa o navegador antes de aceitar trabalhos. Não é necessário manter o Ollama ou o Firecrawl ativos. O modo Inteligente na interface
continua disponível, mas o novo worker Python executa **somente pesquisa
factual sem IA**; nenhuma análise da IA é simulada.

## Testes executáveis

```bash
python3 -m pip install -c garimpo-engine/requirements.lock ./garimpo-engine
PYTHONPATH=garimpo-engine python3 -m unittest discover -s deploy/local-garimpo -p 'test_garimpo*.py' -v
PYTHONPATH=garimpo-engine python3 -m unittest discover -s garimpo-engine/tests -v
python3 -m py_compile deploy/local-garimpo/garimpo_engine.py deploy/local-garimpo/garimpo_connector.py
```

A suíte utiliza fixtures de OpenStreetMap, Firecrawl e o contrato Supabase. Ela
verifica rejeição de salões não correspondentes ao filtro Barbearia, localidades
incompatíveis, duplicatas, fontes, form-encoding Overpass, fallback web e entrega
pela fila. Os testes automatizados não substituem um teste com fontes reais no
Linux do usuário, necessário para confirmar o estado da conexão e dos serviços.

## Limites operacionais

- Nominatim e Overpass públicos têm limites de uso e podem estar temporariamente
  indisponíveis. Respeitar políticas, cache e atribuição OSM/ODbL; para produto
  comercial com escala, hospedar fontes/serviços adequados.
- O motor não inventa faturamento, CNPJ, decisores, intenção de compra ou dados
  que não estejam nas fontes. A revisão antes de contato é obrigatória.
- Região em raio é uma aproximação geográfica; a cidade de registros sem
  `addr:city` é inferida do centro consultado, devendo ser confirmada no CRM.
- Esta versão **não é um serviço hospedado 24/7** e não substitui a infraestrutura
  comercial com faturamento, limites, retenção, LGPD e monitoramento.
- A branch de integração G8 permanece separada até validação de conflitos.

## Diagnóstico

- **Linux conectado mas pesquisa falha imediatamente:** verifique no terminal
  se aparece `Garimpo Python conectado ao CRM`. Status online sozinho não
  identifica a versão do conector.
- **OSM indisponível:** confira internet e a política/limite do provedor. O worker
  tentará Firecrawl local, se disponível.
- **Zero empresas:** revise URLs dos avisos, correspondência do segmento e
  restrição geográfica. Zero não é prova de inexistência de estabelecimentos.
- **Token inválido:** crie novamente o comando pelo CRM, pois apenas a credencial
  ativa mais recente pode consultar a fila.


## Integração validada com a fila real — 17/11/2026 (Brasília)

O conector agora executa o pacote `garimpo-engine` 0.6 no próprio processo Python. Não há ponte Node nem chamada a Firecrawl nesse caminho. A API e as tabelas da fila atual são preservadas; o limite do contrato do CRM continua em dez empresas por trabalho, embora o motor isolado aceite até cem.

Foi criado um workspace temporário de QA, com uma credencial nova exclusiva do teste. O worker consumiu um trabalho real na função `prospecting-local-connector-staged` e entregou três barbearias de Rio Grande/RS, todas com telefone publicado e fontes, com `engineVersion=0.6.0`. O coletor Maps foi executado uma vez; o primeiro contato no motor apareceu em 7,9 s e a execução interna levou cerca de 13 s. Esses tempos não incluem preparação da fila ou instalação e não garantem o tempo de outras buscas. Não foram feitas ligações nem verificada a atividade dos números no WhatsApp.

Também foram verificadas a rejeição da credencial em outro workspace, a repetição de uma entrega já concluída e a preservação de um erro específico de localização. O workspace, a credencial e os trabalhos de QA são temporários; os conectores e pesquisas dos usuários não são alterados por esses testes.

A renovação da reserva ocorre enquanto o coletor trabalha. Uma interrupção de rede na confirmação é repetida com o mesmo ID e lease; uma confirmação já gravada é reconhecida. O checkpoint local impede repetir a coleta de um trabalho já concluído. Resultados parciais conservam os contatos e avisos; dados sem o telefone exigido ficam pendentes no motor. A chave privada permanece no Linux e não deve ser enviada pelo chat.

A função staged conserva o diagnóstico de falhas sem gravar HTML, tokens ou respostas brutas. O frontend exibe esse aviso em vez de transformar a falha em uma lista vazia genérica.

Para atualizar uma instalação anterior, gere o novo comando em **Gerenciar conexão Linux → Instalar ou atualizar motor Python 0.6**, encerre o conector antigo e execute o comando. O novo diretório não sobrescreve a instalação v1. A mensagem esperada é **Garimpo Python 0.6 conectado ao CRM**. A validação feita no Linux de QA não equivale à instalação física no computador do usuário.
