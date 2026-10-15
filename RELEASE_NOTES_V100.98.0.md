# RealTalent CRM V100.98.0 — Prospecting Engine

A V100.98 transforma o Garimpo em um motor de aquisição com fontes diretas e assistidas, sem remover o fluxo de revisão humana do Data Layer.

## Entregas

- Gateway único de prospecção para execução local (Linux/Vite) e hospedada (Supabase Edge Function).
- Google Places API (New) como provider de busca local quando `GOOGLE_MAPS_SERVER_KEY` está configurada.
- Consulta cadastral individual por CNPJ via provider configurável, com BrasilAPI como padrão do protótipo.
- Instagram mantido como descoberta assistida; o CRM não simula uma API oficial inexistente para busca ampla de perfis.
- RT_Capture/Extensão preservada como canal de ingestão em lote.
- Importação CSV/JSON, captura manual, deduplicação e Data Layer preservados.
- Resultados vindos de providers são analisados automaticamente antes da revisão.
- Painel de diagnóstico mostra se cada fonte está Direta ou Assistida.
- Fallback seguro: se Google Places não tiver chave, a busca preparada continua funcionando sem quebrar o Garimpo.
- Lotes hospedados ficam rastreados em `prospecting_batches` e `prospecting_events`.

## Google Places

A chave não é gravada no código nem no navegador. No Linux local ela é lida pelo gateway do Vite através de `.env.local`. Em produção, deve ser configurada como secret da Edge Function.

O provider direto limita uma consulta a 20 resultados para manter custo, latência e revisão humana sob controle. Lotes maiores permanecem apropriados para RT_Capture/importação.

## CNPJ

A integração faz somente consulta individual do CNPJ explicitamente informado pelo usuário. Ela não implementa crawling, full scan ou enumeração automática de CNPJs.

## Compatibilidade

V100.97 Product & Revenue Workspace, V100.96 Guided Selling & Help, V100.95 Workspace Personalization e V100.94 Omnichannel Inbox permanecem preservadas.
