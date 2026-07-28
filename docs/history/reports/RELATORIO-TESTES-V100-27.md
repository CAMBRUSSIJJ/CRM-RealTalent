# Relatório de testes — RealTalent CRM V100.27

Data da validação: 20 de julho de 2026.

## Resultado

A versão V100.27 foi validada a partir de uma instalação limpa das dependências com `npm ci`.

| Verificação | Resultado |
|---|---:|
| Arquivos de teste | 22 aprovados |
| Testes unitários e de integração | 101/101 aprovados |
| TypeScript | aprovado |
| Build de produção | aprovado |
| Auditoria interna de release | 112 verificações, sem falhas |
| Preflight operacional | 17/17 aprovado |
| Smoke test em Chromium | 16 fluxos aprovados |
| Erros de console no smoke test | 0 |
| Erros de página no smoke test | 0 |
| Vulnerabilidades npm conhecidas | 0 |
| Inicialização local e `/health.json` | aprovados |
| Bloqueio de deploy local na Vercel | aprovado |
| Rejeição de placeholders de produção | aprovada |
| Rejeição de deploy sem segredo estável do runner | aprovada |

## Fluxos validados no navegador

- primeiro acesso e personalização;
- modo local corretamente identificado;
- guia rápido;
- abertura das 12 áreas principais;
- Pipeline, cadência, contato assistido e forecast;
- diagnóstico de integridade;
- Central de Integrações;
- fila e operação de automações;
- equipe e convites locais;
- marca, navegação e tema;
- backup e segurança;
- início com base vazia;
- áreas críticas em 1024 px;
- navegação móvel em 390 px.

## Observação do standalone

O standalone concentra o JavaScript em um único arquivo para permitir abertura independente. Por isso, o Vite apresenta um aviso de tamanho do chunk nesse modo. O build normal de produção continua dividido por módulos e não apresentou falha.

## Limites desta validação

O ambiente de auditoria não possuía Docker Desktop nem credenciais do GitHub, Supabase ou Vercel da proprietária. Portanto, não foi possível executar as migrations em um banco remoto real, publicar as Edge Functions ou criar o domínio de produção. Esses passos estão automatizados no pacote e devem ser executados primeiro em staging com as credenciais da conta responsável.
