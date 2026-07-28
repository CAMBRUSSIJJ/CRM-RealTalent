# ADR 0001 — TypeScript como fonte oficial

**Status:** aceito na V100.37.

## Decisão

Toda funcionalidade é implementada em React + TypeScript. HTML standalone é gerado pelo pipeline e contém marcador de origem.

## Consequência

Patches manuais em HTML e extensões de runtime por versão são proibidos. Isso elimina divergência entre código-fonte, demonstração e produção.
