# RealTalent Garimpo G1 + G2 — Investigação e qualificação explicável

## Situação
Primeira entrega integrada ao Garimpo atual, sem substituição do motor de descoberta, mapa, área, filtros, deduplicação e revisão humana.

### G2: qualificação explicável (determinística)
- Aderência ICP: normalização do fit já existente, condicionada por tamanho de amostra. Poucos clientes ganhos => avaliação provisória.
- Potencial comercial: peso dos sinais existentes; presença digital não significa intenção de compra. Não usa probabilidade inventada pelo Qwen.
- Confiança das evidências: combina Entity Resolver e Data Layer; limita severamente duplicidade confirmada, entidade não empresarial, ausência de identidade e dados bloqueados.
- Exibe três dimensões, motivos, lacunas e rastreabilidade, sem mudar o score anterior ou a regra de aprovação humana.
- O modelo não calcula o score e não consegue autorizar envio ao CRM.

### G1: investigação assistida e opcional
- Usuário abre a Revisão > Guiada e clica "Investigar com IA".
- O navegador envia para o gateway local apenas nome comercial, cidade, segmento, descrição comercial e URL declarada do website.
- Antes de analisar, o servidor tenta ler a página HTTPS pública usando o leitor com DNS fixado e bloqueios SSRF. Não faz login, acesso a páginas privadas, scripts ou coleta redes sociais.
- O modelo Qwen3 no Ollama local elabora resumo comercial, hipóteses, perguntas e abordagem consultiva.
- O relatório diferencia conteúdo efetivamente lido (com fonte) de cadastro originário, que pode estar incompleto.
- Em caso de indisponibilidade do Ollama ou site, informa limitação; não apresenta pesquisa inexistente.
- Não envia dados privados de clientes ao SearXNG, não envia mensagens e não modifica registros do CRM. O Agent está disponível em loopback somente.
- Sem produção, Railway, Supabase ou migrações.

### Limitações
- O leitor HTTPS não é navegador renderizado e pode não conseguir ler páginas JavaScript, sites com bloqueio, plataformas sociais ou PDFs.
- Avaliação de potencial não é probabilidade estatística de venda.
- A investigação é sob demanda, uma empresa por vez, sem lotes massivos nem custos de API pagos.
- A versão inicial não persiste o relatório do Qwen no Supabase: ele fica visível na sessão de revisão.
- Não altera o território do Garimpo. A escolha da região e a aprovação final continuam com o usuário.

### Teste local
Branch: feat/realtalent-garimpo-g1g2-investigation-20261028
Launcher recomendado (diagnóstico e terminal persistente): bash scripts/garimpo-g1g2-linux/abrir-com-diagnostico.sh
Serviço interno: bash scripts/garimpo-g1g2-linux/abrir-local.sh
O launcher recomendado grava ~/RealTalent-Garimpo-G1G2-Teste/logs/ultimo-inicio.log,
mostra os logs relevantes quando a inicialização falha e aguarda Enter antes de encerrar.
Ao atualizar pelo terminal, NÃO use comandos "|| exit 1" no shell interativo; eles fecham o terminal do usuário.
Endereço do CRM de teste: http://127.0.0.1:4197
Motor de prospecção (auto-start + healthcheck): http://127.0.0.1:4320/api/prospecting-agent/health
Gateway de IA (auto-start + healthcheck): http://127.0.0.1:8804/tools/health
Ollama: 127.0.0.1:11434 | SearXNG opcional: 127.0.0.1:8888
A V6.4 permanece em 4196, e seu motor anterior em 4319 não é modificado.
O motor G1/G2 grava estado isolado em ~/RealTalent-Garimpo-G1G2-Teste/garimpo-agent-state.
Logs: ~/RealTalent-Garimpo-G1G2-Teste/logs/prospecting-agent.log e gateway.log.
Ao encerrar com Ctrl+C, somente serviços iniciados pelo launcher G1/G2 são desligados. Se o motor 4320 já estava ativo, ele é reaproveitado sem ser encerrado.
Caso uma das portas esteja ocupada por serviço inesperado ou o healthcheck falhe, o launcher mostra um erro sem interferir na V6.4.

### Revisão única — empresas + dados brutos (UX)

- **Buscar** concentra somente território, busca, execução e números de investigação. Os atalhos "Empresas", "Dados brutos", "Filtrados" e "Duplicidades" abrem diretamente a aba **Revisar**.
- **Revisar > Lista** inicia mostrando todas as empresas da base de revisão, com filtros de atenção e prontidão à disposição. O botão "Guiada" abre os dados completos e o painel G1/G2 de cada empresa.
- **Revisar > Fontes brutas** concentra resultados de origem dos quatro tipos `raw`, `candidate`, `rejected` e `duplicate`; a pessoa pode revisar, ignorar ou, após conferir o nome real e outras informações, adicionar um registro pendente à revisão.
- Os candidatos da execução atual são recuperados para a base de revisão por deduplicação ao abrir a etapa. Importações repetidas não substituem edições manuais já existentes.
- Conteúdos de sites, diretórios, resultados repetidos e demais ocorrências não são classificados como empresas confirmadas só por terem sido encontrados. A triagem humana e as restrições para aprovação e envio ao CRM são preservadas.
- Os totais de ocorrências na busca podem ser maiores do que o número de fontes individuais armazenadas; o app informa essa limitação.

### Checklist de QA
- Criar Garimpo com cidade e raio; buscar empresas sem ampliar território.
- Revisão > Guiada > conferir scores e motivos; sem alterar aprovação automática.
- Clicar Investigar com IA; verificar link de fonte caso site lido, ausência de fonte caso não lido.
- Tentar empresa com duplicidade confirmada e item tipo diretório: não priorizar.
- Forçar queda Ollama/HTTP: explicar falha sem trocar dados ou inventar análise.
- Selecionar outra empresa durante análise: resposta anterior não pode contaminar o novo registro.
- Validar visual em Firefox 1280x720 e telas menores e alto contraste.
- Revisar consumo de VRAM / latência na GPU de 8 GB antes de deploy.
