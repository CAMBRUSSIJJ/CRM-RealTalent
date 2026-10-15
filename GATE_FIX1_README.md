# RealTalent CRM V101.8.4-H3 — Gate Fix 1

Patch de QA/launcher gate. Nenhuma regra funcional do CRM foi alterada.

Corrige falso negativo no audit V101.8.3-H1 Contact Identity Sync, que exigia literalmente o nome da release H2 no launcher.
O gate agora valida a versão atual declarada no package.json e a preservação dos marcadores de capacidade Contact Identity Sync e Connect One-Tap.
