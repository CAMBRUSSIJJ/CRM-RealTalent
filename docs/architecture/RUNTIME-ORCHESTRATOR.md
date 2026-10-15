# Runtime Orchestrator

O `scripts/start.mjs` é a autoridade para inicialização local a partir da V101.10.8. Ele concentra pré-condições, integridade de dependências, migração de estado local, ciclo de vida dos serviços, health checks e encerramento coordenado.

Princípios: loopback por padrão, token de runtime fora do bundle, fail-fast para serviços essenciais, fallback Linux legado temporário e nenhuma mutação de dados de domínio durante bootstrap.
