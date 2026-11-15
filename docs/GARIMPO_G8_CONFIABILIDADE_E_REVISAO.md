# Garimpo G8 — confiabilidade e revisão comercial

Implementação sobre `18f7ed2006f36a67cde1c7f52844187704842ea8`, da branch `release/realtalent-ia-local-pr83-20261115`. A auditoria fornecida pelo usuário orientou o escopo. A gravação e a instalação Linux do usuário não foram acessadas nesta implementação.

## Resultado por fase

| Fase | Implementação |
| --- | --- |
| G8.1 — Estabilidade | Classificação compartilhada, confirmação de ressalvas, persistência completa da investigação atual, histórico por empresa, estados opcionais/essenciais, validação estrutural de respostas e atualização verificável do conector. |
| G8.2 — Revisão | Resumo comercial antes do formulário, fatos e próximas ações com fontes, cadastro separado da análise comercial, evidências consolidadas, histórico consultável, diagnóstico recolhido e correção de largura em celular. |
| G8.3 — Contexto | Perguntas e hipóteses derivadas de serviços, preços, posicionamento, canais publicados e eventos comprovados. Ausência de fatos não gera afirmação de necessidade ou intenção de compra. |
| G8.4 — Pesquisa | Lacunas priorizadas, consultas sequenciais e limitadas, diário por execução e retomada do mesmo plano sem repetir consultas registradas. |

Regras e apresentação foram extraídas para serviços/componentes menores. A página principal mantém os fluxos existentes; esta entrega não reestrutura todo o CRM nem adiciona Gemini, n8n ou envio automático de mensagens.

## Estados e aprovação

`prospecting-data-layer.ts` é a fonte de classificação para lista, mapa, filtros, contadores e transferência:

- **Cadastro suficiente:** empresa e canal de contato disponíveis.
- **Empresa verificada:** identidade confirmada pelo critério cadastral, coordenadas válidas, confiança territorial mínima de 65 e tipo de empresa adequado. Essa classificação não comprova necessidades comerciais.
- **Pronta para transferência:** aprovada e sem bloqueadores, com os critérios atendidos ou ressalvas explicitamente aceitas.

Duplicidade confirmada, ausência de identidade/contato ou resultado classificado como diretório/conteúdo continuam bloqueando aprovação. Ressalvas permitidas exigem diálogo explícito; responsável, motivos, data e campos revisados ficam em `rawData.garimpoApproval`. Mudanças relevantes invalidam o aceite. Salvar somente uma nova investigação não invalida o aceite se os campos revisados permanecerem iguais.

O resultado da investigação distingue `completed`, `limited` e `partial`. Instagram/sinais opcionais indisponíveis produzem limitação; falha em extração/análise essencial permanece parcial. Falha na coleta sem outras fontes utilizáveis também é parcial.

## Persistência e evidências

A resposta atual completa fica em `rawData.aiResearchResult`, junto às estruturas comerciais e às fontes. O salvamento automático não preenche campos cadastrais; correções continuam passando pela revisão. O cadastro conserva até vinte referências compactas de versões, evitando vinte cópias completas no armazenamento do navegador.

Os resultados completos por execução permanecem em `prospecting_ai_jobs`. Recuperação e consulta de versão filtram organização e empresa antes do limite de linhas; versões históricas são consultadas por ID exato. Conectores antigos usam nome/cidade como alternativa quando não há vínculo por ID. Registros com outro `prospectId` não são associados apenas por terem o mesmo nome.

A investigação atual abre pelo cache mesmo sem conexão. Consultar versões anteriores depende do servidor e da retenção dos trabalhos; não há promessa de arquivo permanente após eventual exclusão desses registros. Nenhuma migração, permissão de banco ou política RLS foi alterada.

As evidências consolidam URLs de descoberta e investigação com origem, data, leitura/bloqueio, fatos e divergências. O contador antigo foi nomeado **Fontes da descoberta** para explicitar seu escopo. Domínios registráveis são calculados com `tldts`; domínios distintos não comprovam independência editorial.

## Versões, provedores e atualização Linux

Foi confirmado no código que o instalador apontava para `991bf142a74a61a722aa7265ca96c56c939f3acf`, cujo ZIP tinha apenas os módulos antigos. Isso comprova o vínculo desatualizado do instalador, não a versão efetivamente em execução no computador do usuário.

O pacote G8 inclui os módulos e contratos compartilhados atuais. O instalador do CRM fica fixado em commit imutável e SHA-256 do novo ZIP. Para instalações existentes, siga [G8-LEIA-ME.md](../deploy/local-garimpo/G8-LEIA-ME.md): o atualizador preserva `garimpo.env`, token, modelo e dependências, confere versões/hashes, cria backup e testa o código instalado. Edições locais desconhecidas interrompem a atualização antes da escrita. A reversão recusa sobrescrever edições posteriores.

O contrato é `garimpo-research/8`; resultados antigos continuam legíveis quando válidos. O diagnóstico informa versão/modelo/perfil e tentativas/sucessos/falhas reais dos provedores. Crawl4AI só é marcado como usado após chamada efetiva. Não é possível inferir a execução interna de SearXNG pelo sucesso do Firecrawl, e a interface declara essa limitação.

A pesquisa web adaptativa limita o plano principal a quatro consultas no perfil baixo ou seis no normal, além dos limites já existentes de Instagram e páginas internas. Não há paralelização de coletas. O plano é preservado na retomada do mesmo trabalho. Uma nova investigação explícita é outra execução e pode pesquisar novamente. Tendências de mercado sem fonte não foram acrescentadas como fatos; hipóteses usam somente o contexto comprovado.

## Validação de desenvolvimento

- TypeScript e build Vite em modo local concluídos.
- Suíte de `src`: **780 testes passaram**, 42 ignorados pelas condições já existentes.
- Conector: **48 testes passaram**, com páginas e respostas de modelo simuladas, incluindo limites de pesquisa e retomada.
- Atualizador: testes de compatibilidade, aplicação, idempotência, restauração, código desconhecido e reversão após teste malsucedido.
- O ZIP antigo foi extraído em uma instalação temporária e atualizado com o pacote real: verificação, aplicação, reexecução e restauração concluíram, preservando byte a byte a configuração de teste.
- Chromium com CRM em modo local: investigação simulada com cinco fontes, reabertura do histórico, confirmação das ressalvas, criação de empresa canônica na transferência e preservação das fontes após recarregar; sem erros de JavaScript. Layout conferido em 1440 e 390 pixels.
- Contratos e módulos passam por validação estrutural; o pacote não contém `garimpo.env`, credenciais ou `node_modules`.

`npm test` sem recorte inclui scripts escritos para `node:test`, que o Vitest interpreta como arquivos sem suíte, além de testes de espelhos antigos. O problema do executor foi reproduzido na base. Também foi corrigido um defeito preexistente na fixture de sugestões: ela construía `new URL('not-a-url')` antes de testar a rejeição da própria URL inválida. A suíte de frontend foi executada com `npm test -- --dir src --maxWorkers=2`, e o conector com seu próprio `npm test`.

O audit global de sintaxe não passou: acusa botões sem `type` em `meet-context-panel.tsx` e `meet-page.tsx`, arquivos que permanecem iguais à base. Esta entrega não declara o repositório inteiro sem pendências. A nova revisão usa botões com tipo explícito, links externos protegidos, estados acessíveis e limpeza de consultas ao trocar de empresa.

## Dependências e limites de publicação

Na análise do lockfile final, `npm audit --omit=dev --json` encontrou **zero alertas**. Incluindo desenvolvimento, permanecem **sete alertas: quatro altos e três moderados** em Vite/Vitest e dependências transitivas de ferramentas (`@vitest/mocker`, `nanoid`, `postcss`, `source-map-js`, `undici`). Isso não comprova exploração em produção. As correções sugeridas pelo gerenciador exigem atualização/validação do conjunto de ferramentas e ficam registradas como pendência; nenhum `audit fix --force` foi aplicado.

Os testes de desenvolvimento não substituem a operação com Firecrawl, Ollama, Supabase e dados reais. Antes de produção: publicar os componentes compatíveis em ambiente de validação, atualizar o conector pelo guia, pesquisar uma empresa conhecida, conferir fontes e tempos/memória no Linux, recarregar o resultado e validar aprovação/transferência de uma empresa de teste. Esta entrega prepara código e pacote para revisão; não publica funções, migrações ou uma nova versão de produção.
