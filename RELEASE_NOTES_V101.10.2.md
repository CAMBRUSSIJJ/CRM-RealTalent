# RealTalent CRM V101.10.2 — Prospecting Agent for Linux

## Entregue

- serviço local `RealTalent Prospecting Agent` em `127.0.0.1:4319`;
- fila persistente de jobs;
- pause / resume / cancel;
- OpenStreetMap + Overpass para descoberta automática;
- Nominatim para resolução de regiões;
- crawler de sites públicos com `robots.txt`;
- extração de telefone, e-mail, Instagram e CNPJ;
- enrichment cadastral por BrasilAPI quando há CNPJ;
- Chromium headless opcional como fallback de páginas JavaScript;
- deduplicação interna + chaves de registros já existentes no CRM;
- memória de identidade por workspace: resultados de jobs anteriores também entram na deduplicação das campanhas seguintes;
- campanhas diárias e semanais;
- importação automática de jobs concluídos para a fila de Revisão do Garimpo;
- painel de progresso dentro do Garimpo;
- instalador opcional `systemd --user`;
- sem migration SQL nova: permanecem 49/49.

## Política de coleta

O Agent trabalha somente com fontes e páginas públicas. Não implementa login automático, solução de CAPTCHA ou mecanismos para contornar bloqueios de sites.

## Base

V101.10.1 — Prospecting Search Automation.
