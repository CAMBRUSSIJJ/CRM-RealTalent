# RealTalent CRM V101.10.2-H3 — Prospecting Agent Search Runtime Fix

## Correção principal
A H3 corrige o Garimpo automático quando o Agent está conectado, mas a busca não retorna empresas ou falha com erro genérico de rede.

## Runtime de busca
- OpenStreetMap/Overpass continua sendo a fonte principal sem Google Places.
- Nominatim é usado para localizar a região quando disponível.
- Se Nominatim/geocodificação falhar, o Agent tenta a área administrativa diretamente no Overpass.
- Se OSM não atingir a meta, o Agent tenta descoberta web pública e visita os sites encontrados para extrair contatos.
- Retries conservadores foram adicionados para falhas transitórias.
- Erros agora indicam DNS, conexão recusada ou timeout, em vez de apenas `fetch failed`.

## Segurança
- Somente URLs públicas em produção.
- Respeita robots.txt no crawler de sites.
- Não resolve CAPTCHA, não faz login e não contorna bloqueios.
- Loopback/private URLs só são liberadas no modo de teste do próprio QA.

## QA novo
- `qa:v101.10.2:h3`
- `runtime:prospecting-search`
- Runtime smoke ponta a ponta com OSM, descoberta web, enriquecimento e fallback sem Nominatim.
