# RealTalent CRM V101.10.3 — Garimpo Search & Processing Engine

Base: **V101.10.2-H3 — Prospecting Agent Search Runtime Fix**.

## O que muda

O Garimpo deixa de tratar prospecção como uma única consulta e passa a operar como campanha persistente de cobertura territorial e processamento de empresas.

### Buscas
- formulário simplificado por segmento, território, área, raio, modo e objetivo;
- modos **Máxima cobertura**, **Mais rápida** e **Menor consumo**;
- objetivo **encontrar o máximo possível** ou quantidade definida;
- Search Planner com expansão automática de termos;
- Territory Engine com grade geográfica e subdivisão de células densas;
- cobertura territorial e saturação estimada separadas;
- mapa de cobertura com células pendentes, em execução, concluídas e com falha;
- registro das execuções por provider.

### Processamento
- `RawCompany → CompanyCandidate → Revisão → CRM`;
- Company Resolver com CNPJ, domínio, telefone, Instagram, nome/cidade e coordenadas;
- crawler de website com retry conservador;
- extração de telefone, e-mail, redes e CNPJ;
- enriquecimento cadastral quando há CNPJ;
- evidência/proveniência por campo;
- completude e confiança calculadas separadamente;
- pipeline visual de identidade, website, contatos, empresa legal, redes e validação.

### Revisão
- resultados brutos não entram diretamente no CRM;
- fila de revisão existente foi preservada;
- aprovar, editar, descartar e enviar ao CRM continuam separados da descoberta.

### Persistência
- estado do Prospecting Agent passa para schema v2;
- jobs H3 anteriores são migrados sem apagar histórico/fila;
- campanha armazena plano, células, provider runs, cobertura e processamento.

## Segurança e limites
O Agent continua restrito a fontes e páginas públicas. Não faz login automático, não resolve CAPTCHA e não contorna bloqueios. “Cobertura” é estimativa operacional; o produto não afirma encontrar 100% das empresas existentes.

## Limite conhecido
A visualização territorial das células está funcional. O desenho livre de polígono customizado no mapa ainda não altera a geometria de entrada nesta release; `Área do mapa` usa a geometria geocodificada da região informada.
