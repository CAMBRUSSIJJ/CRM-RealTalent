# Changelog — RealTalent CRM V100.32

## Inteligência Geográfica

- evolução da aba independente **Mapa Comercial**;
- três modos de visualização: Marcadores, Mapa de calor e Visão mista;
- mapa de calor por quantidade, valor do pipeline e ações atrasadas;
- raio comercial configurável de 2 a 50 km a partir do lead selecionado;
- seleção em massa pela área visível ou por retângulo;
- barra operacional para abrir Leads, criar fila de ligações, pesquisar a região no Garimpo e exportar CSV;
- painel de regiões com leads, pipeline, ações atrasadas e conversão;
- camada e lista próprias para prospects do Garimpo;
- transferência de contexto territorial para o Garimpo;
- fallback local para uso sem carregamento do provedor externo;
- layout responsivo para desktop e celular.

## Preservação

As áreas existentes do CRM, dados, filtros, pipeline, ligações e playbooks foram preservados.

## Observação técnica

Nesta etapa, leads sem latitude e longitude persistidas são posicionados por estimativa da cidade cadastrada. A localização exata por endereço depende da futura conexão de geocodificação com Supabase e provedor de mapas.
