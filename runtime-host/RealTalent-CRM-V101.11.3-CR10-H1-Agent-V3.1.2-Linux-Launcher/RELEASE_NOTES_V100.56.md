# V100.56.0 — Experience Refinement

## Objetivo

Refinar Account 360, Território e a preparação da Central de Ligações antes de evoluir novamente a tela durante a conversa.

## Account 360

- Header executivo com pipeline, cobertura, relacionamento e pessoas mapeadas.
- Próximo gap recomendado com ação direta.
- Buying committee em três visualizações: Mapa, Cards e Lista.
- Painel de saúde separa cobertura e risco sem colisão visual.
- Modal full-screen usa portal no `document.body`, evitando recorte pela Sidebar e containers da aplicação.

## Stakeholders

- Formulário inicial reduzido aos dados realmente necessários.
- Campos avançados recolhíveis.
- `Posicionamento na compra` substitui o termo ambíguo `Postura`.
- Influência simplificada para Baixa/Média/Alta.
- Score de relacionamento calculado pelo CRM a partir de força declarada, volume/recência de interações e posicionamento.

## Território

- Remoção do basemap que exibia `API KEY REQUIRED`.
- OpenStreetMap como camada básica sem chave obrigatória para desenvolvimento/uso básico.
- Camadas e filtros avançados passam a ser progressivos em vez de sempre ocupar a toolbar.
- Resumo reduzido para Empresas, Pipeline e Qualidade da localização.
- Sidebar passa a priorizar Empresas, Regiões e Prospects.
- Abertura mantém `fitBounds` para enquadrar os registros visíveis.

## Preparação de sessão

- Configuração passa a ocupar workspace full-screen em vez de modal comprimido.
- Fila mostra stakeholder, papel, telefone e motivo de prioridade.
- Objetivo comercial orienta a sessão.
- `Power` passa a ser apresentado como `Power assistido`: prepara o próximo contato, nunca inicia chamada automaticamente.
- Preferências de tela continuam persistentes.

## RealTalent Connect

A implementação anterior foi retirada da interface e do runtime ativo. As migrations SQL antigas relacionadas ao Connect foram preservadas, pois fazem parte do histórico imutável do banco e seus checksums. O novo Connect poderá ser integrado posteriormente por uma interface nova, sem depender do fluxo antigo.

## Compatibilidade

Nenhuma nova migration foi necessária nesta versão. A versão mantém as 34 migrations existentes.
