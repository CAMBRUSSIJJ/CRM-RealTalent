# V101.8.4-H3 Gate Fix 1

Corrige somente o contrato histórico `qa:v101.8.3:identity-sync`.

O audit da V101.8.3-H1 exigia literalmente o título do launcher da H2, causando falso negativo em releases posteriores.
Agora o gate valida:

- a versão corrente declarada pelo `package.json` no launcher;
- o marcador preservado `Contact Identity Sync`;
- o marcador preservado `Connect One-Tap para iPhone`.

Nenhuma lógica de CRM, sincronização, OAuth, comunicação ou Connect foi alterada neste hotfix.
