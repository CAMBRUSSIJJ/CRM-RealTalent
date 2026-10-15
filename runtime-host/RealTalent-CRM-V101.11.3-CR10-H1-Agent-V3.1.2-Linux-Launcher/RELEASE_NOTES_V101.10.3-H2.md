# V101.10.3-H2 — Coverage Truth

- Separa área tentada, pesquisada com sucesso e área com falha.
- `territoryPercent` permanece compatível, mas agora representa cobertura bem-sucedida.
- Células falhadas não elevam saturação por ausência artificial de novos resultados.
- Saturação passa a considerar runs válidas/falhas e expõe confiança `low|medium|high`.
- A interface mostra cobertura real em vez de tratar plano encerrado como 100% pesquisado.
