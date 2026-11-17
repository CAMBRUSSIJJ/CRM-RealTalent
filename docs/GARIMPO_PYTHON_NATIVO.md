# Garimpo Python nativo — uso real no CRM

## O que foi corrigido

O Preview do CRM já recebia buscas, mas o worker Node/Firecrawl encerrava
trabalhos como `local_research_failed`. A autenticação por workspace e a fila
do Supabase continuavam funcionando. O novo fluxo remove a dependência de Node,
Docker e Ollama **para descoberta básica de empresas**.

**Preview → Edge Function de fila existente → worker Python no Linux →
Nominatim (localização) + Overpass (estabelecimentos OSM) →
Firecrawl local opcional (descoberta complementar) → revisão no CRM.**

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
   `~/Downloads/RealTalent-Garimpo-Python-v1`, executa testes sem usar a rede
   e inicia o Python em primeiro plano. As instalações existentes não são apagadas.
5. De volta ao Preview, aguarde o status **Linux conectado**, selecione
   **Essencial · sem IA** e pesquise por **Barbearia — Rio Grande, RS**.
6. Verifique **Revisar** e confira as URLs das fontes. Se algum provedor
   estiver indisponível, o resultado exibe um aviso específico.

O computador precisa continuar ligado e conectado para receber pesquisas.
Não é necessário manter o Ollama ativo. O modo Inteligente na interface
continua disponível, mas o novo worker Python executa **somente pesquisa
factual sem IA**; nenhuma análise da IA é simulada.

## Testes executáveis

```bash
python3 -m unittest discover -s deploy/local-garimpo -p test_garimpo_python.py -v
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
