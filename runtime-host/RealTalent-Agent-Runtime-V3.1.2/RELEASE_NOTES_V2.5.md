# Release Notes — RealTalent Agent V2.5

## Adicionado

- Multimodal Intelligence como camada nativa do runtime.
- Pipeline visual em duas etapas: Perception Pass -> Reasoning/Synthesis.
- Detecção de dimensões/metadados para PNG, GIF, JPEG e WebP compatível.
- Classificação visual de UI, comparação, gráfico, documento e referência visual.
- Grounding por regiões normalizadas.
- Diagnóstico de screenshots/UI.
- Comparação de múltiplas imagens.
- Evidência visual estruturada no turno da resposta.
- `visual_context` para referências em turnos posteriores sem reenviar a imagem.
- Endpoints `/multimodal-intelligence` e `/multimodal-intelligence/classify`.
- UI “Visão V2.5” com principais achados.
- Vision recomendado automaticamente pelo perfil de hardware, com opt-out explícito.

## Melhorado

- Attachment routing continua fail-closed para imagem.
- Context Engine passa a considerar evidência visual anterior.
- Reference Resolver reconhece “esse botão/essa parte/essa tela”.
- Streaming com imagem usa caminho multimodal bufferizado para manter o Perception Pass antes da síntese.
- Observabilidade do turno inclui versão, modo visual, modelo/provider de percepção e quantidade de achados.

## Corrigido / endurecido

- Bloqueio de afirmações sobre pixels quando Vision não está configurado.
- Visual evidence persiste sem guardar novamente os bytes/pixels no metadata estruturado.
- Compatibilidade mantida com Memory & Knowledge V2.4, Intelligence Core V2.3 e Grounded App Intelligence V2.2.

## Não alterado

- Nenhuma nova mutação de negócio foi adicionada ao CRM ou Blue Ocean nesta release.
- Permissões e confirmação de escrita das tools continuam preservadas.
