# Validação do motor Garimpo 0.6 — 17/11/2026

Implementado: consultas por áreas internas ao município e termos equivalentes, entrega progressiva, limite de consultas, parada ao atingir a meta e retomada com checkpoints. A retomada cria outra pesquisa e preserva a original. O enriquecimento pendente fica registrado mesmo quando o telefone já foi entregue.

## Comparativo com dados reais

Parâmetros: barbearias, Rio Grande/RS, Google Maps, limite 100, telefone obrigatório, consulta aos sites desativada, sem qualificação por IA.

| Execução | Estabelecimentos com telefone publicado | Observação |
| --- | ---: | --- |
| 0.5, consulta inicial | 40 | Entrega ao final, após 57,6 s |
| 0.6, modo padrão | 39 | Primeiro contato em 14,6 s; término em 50,9 s |
| 0.6, modo expandido e retomada | 85 | Seis consultas em cinco áreas; cinco consultas concluídas reaproveitadas |
| 0.6, repetição a partir do cache | 85 | Seis acertos de cache; nenhuma nova coleta no Maps |

A pesquisa expandida foi cancelada com 81 resultados, durante a sexta consulta. A retomada preservou esses contatos, pulou as cinco consultas concluídas e executou novamente apenas a consulta interrompida, chegando a 85 resultados. O tempo da retomada isolada não representa o tempo total da busca expandida. A variação de 40 para 39 entre consultas iniciais foi observada na fonte; o comparativo de expansão usa os 39 registros da própria versão 0.6.

## Verificação do fluxo

- 124 testes Python e 5 testes de compatibilidade da exportação com o CCRM passaram.
- Navegador local: contato durante a busca, cancelamento preservando contatos, botão de retomada, pesquisa original intacta, exportação e tela de celular.
- Preview HTTPS com coleta real, limite 11 e sites desativados: 11 resultados/exportados, primeiro contato no motor em 7,2 s, primeira exibição em 8,3 s e conclusão em 18,9 s. Uma execução do coletor, sem cache do Maps.
- Sessão com cookie Secure/HttpOnly; fragmento de acesso removido da URL; nenhum erro JavaScript; sem transbordamento horizontal na largura de 390 px.
- Testes de regressão incluem encerramento do processo ao atingir a meta, cache parcial, enriquecimento interrompido, contato novo em duplicata e parada de todo o plano quando a fonte bloqueia a coleta.

## Limites da evidência

São resultados observados para uma cidade e segmento. Telefones publicados não foram testados por ligação nem confirmados como contas de WhatsApp ativas. A expansão não garante cobertura integral do município. Cache, disponibilidade da fonte, quantidade solicitada e consulta aos sites alteram os tempos. O modo expandido pode fazer mais consultas e demorar mais para concluir.

Ollama permanece opcional e não foi conectado neste preview. Um novo leitor de sites JavaScript/Crawl4AI não faz parte desta versão. As proteções de rede e o respeito a restrições da fonte foram preservados. O preview usa banco de teste, sem alteração na produção do CCRM.
