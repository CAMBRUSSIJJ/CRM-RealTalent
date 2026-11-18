# Integração com a fila do CRM

A integração atual deste PR está em `deploy/local-garimpo/garimpo_v06.py` e `garimpo_connector.py`. O instalador do CRM instala o pacote, o coletor Maps e o navegador, e executa o worker Python diretamente. Ele consome a fila Supabase atual e converte os contatos e evidências para `AiSearchResult`, recebido pela revisão do Garimpo.

Consulte [o guia de instalação e a validação da fila real](../docs/GARIMPO_PYTHON_NATIVO.md). O token da fila é privado do computador e da organização. A fila recebe até dez empresas por trabalho e não exige disponibilizar a API REST do motor nem hospedar uma chave global no frontend.

Os módulos `garimpo.api` e `garimpo.preview` continuam disponíveis para uso isolado e testes do motor. Eles não são necessários para o caminho de execução instalado pelo CRM.
