# RealTalent IA Local — melhoria de leitura e análise

Atualização preparada para o agente local usado pelo instalador enviado nesta conversa. Mantém o modelo escolhido em `agent.env` (no seu caso, `qwen3:8b`).

## Aplicar no seu Linux

1. Extraia o ZIP e abra um terminal na pasta `RealTalent-IA-Local-Melhoria`.
2. Confira a compatibilidade, sem alterar arquivos:

```bash
bash atualizar-linux.sh --check
```

3. Se a verificação indicar compatibilidade, aplique:

```bash
bash atualizar-linux.sh
```

O aplicativo precisa do Node.js 22.12 ou superior da linha 22. O instalador da melhoria usa os programas já instalados. O caminho padrão é `~/.local/share/realtalent-ai/repo`. Uma instalação em outra pasta pode ser indicada com `--repo /caminho/do/repo`.

São atualizados três módulos e adicionado um módulo de controle de contexto. O script cria backup, reinicia `realtalent-ai-agent.service` e verifica a resposta em `http://127.0.0.1:8792/tools/health`. Se falhar, tenta restaurar os arquivos anteriores e reiniciar o agente. Uma falha no próprio serviço pode exigir correção manual; o caminho do backup aparece no terminal.

Se aparecer **versão incompatível ou edição local**, nenhum arquivo é alterado. Envie a mensagem exibida; os arquivos desta instalação precisam ser comparados antes de adaptar a melhoria. A compatibilidade é verificada pelo conteúdo de cada módulo, e não apenas pelo nome da branch ou pelo hash do commit.

## Reverter

Na mesma pasta do pacote:

```bash
bash restaurar-linux.sh
```

Os backups ficam em `~/.local/share/realtalent-ai/quality-v61-backups/`. A restauração recusa sobrescrever edições feitas depois da aplicação.

Esta melhoria altera arquivos rastreados pelo Git. **Antes de executar novamente o instalador original `start-linux.sh`, reverta esta melhoria.** O instalador original recusa atualizar um repositório com alterações locais. Após uma atualização oficial, este pacote pode precisar de adaptação.

## O que muda

- Conserva linhas curtas, nomes de serviços e conteúdo de cabeçalhos e rodapés. Remove menus, scripts e estilos. Os contatos continuam sendo ocultados antes da análise comercial, conforme a regra já existente no agente.
- Aceita o domínio da empresa sem prefixo e tenta HTTPS para endereços HTTP. O leitor continua acessando somente HTTPS e mantém as verificações de endereço e redirecionamento. Sites disponíveis apenas em HTTP continuam sem leitura.
- Usa `OLLAMA_CONTEXT_LENGTH` nas duas funções atualizadas, com padrão de 4.096 tokens. Reserva espaço para a resposta e reduz textos longos antes da chamada. É uma estimativa conservadora por bytes, não uma contagem exata do tokenizador do Qwen. Valores inválidos ou fora de 2.048–16.384 usam o padrão.
- Preserva a pergunta atual e a identidade das fontes durante a redução. Se o conteúdo mínimo não couber, retorna análise insuficiente em vez de cortar a pergunta.
- Rejeita campos de análise com tipos inválidos e níveis de qualidade desconhecidos. Acrescenta códigos distintos para timeout, resposta inválida e indisponibilidade.

As alterações de contexto e validação abrangem a investigação de empresas (`crm-prospect-investigation-g1`) e a pesquisa aprofundada (`crm-deep-research-v60`). As outras rotas de chat e planejamento continuam com suas configurações existentes.

O pacote não instala Crawl4AI, Firecrawl ou SearXNG. A pesquisa externa ainda depende da configuração existente. Não modifica `agent.env`, tokens, modelos instalados, dados do CRM ou configuração do Ollama.

## Verificações e limites

```bash
bash testar.sh
```

Os testes usam páginas e respostas simuladas, sem chamar o seu Ollama. Incluem as regressões do leitor, normalização de sites, limites de contexto, validação de respostas, preservação das restrições de rede, aplicação, backup e restauração. A qualidade e a velocidade das respostas reais ainda precisam ser medidas no seu equipamento.

Depois de aplicar, investigue uma empresa com website conhecido no CRM. Confira se os serviços descritos e a fonte exibida correspondem à página. Compare também o tempo de resposta com o comportamento anterior.

Código-base analisado: `CAMBRUSSIJJ/CRM-RealTalent`, commit `7958ae684f75dbc1695d908f5838ed27466c275e`, branch `feat/realtalent-ai-persistent-cloudflare-20261031`. O pacote inclui o diff e os módulos originais para revisão.
