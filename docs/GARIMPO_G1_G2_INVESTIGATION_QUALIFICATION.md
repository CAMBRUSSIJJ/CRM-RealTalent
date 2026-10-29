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
Launcher: bash scripts/garimpo-g1g2-linux/abrir-local.sh
Endereço: http://127.0.0.1:4197
Gateway local: http://127.0.0.1:8804
Ollama: 127.0.0.1:11434 | SearXNG: 127.0.0.1:8888
V6.4 permanece em 4196.

### Checklist de QA
- Criar Garimpo com cidade e raio; buscar empresas sem ampliar território.
- Revisão > Guiada > conferir scores e motivos; sem alterar aprovação automática.
- Clicar Investigar com IA; verificar link de fonte caso site lido, ausência de fonte caso não lido.
- Tentar empresa com duplicidade confirmada e item tipo diretório: não priorizar.
- Forçar queda Ollama/HTTP: explicar falha sem trocar dados ou inventar análise.
- Selecionar outra empresa durante análise: resposta anterior não pode contaminar o novo registro.
- Validar visual em Firefox 1280x720 e telas menores e alto contraste.
- Revisar consumo de VRAM / latência na GPU de 8 GB antes de deploy.
