# RealTalent G4.4 — investigação comercial com pesquisa pública

Estado: implementação no PR #78, em revisão. Não aplicada ao Supabase de Production.

## Novo fluxo no CRM

No **Garimpo → Revisar → Guiada**, selecione uma empresa e clique em
**Investigar com IA / Investigar novamente**.

O G1/G2 agora:
1. Pesquisa o **nome público da empresa e a cidade**, via SearXNG (quando configurado)
   ou o motor de pesquisa do Garimpo local na porta `4319`.
2. Filtra os resultados por nome, consulta até quatro URLs públicas HTTPS e aplica
   verificação de segurança (sem URLs privadas ou redirecionamentos inseguros).
3. Diferencia a identidade **compatível**, **parcial** ou **não confirmada**; só envia ao
   Qwen o corpo de páginas lidas cujo conteúdo é compatível com a empresa.
4. Produz resumo fundamentado, possíveis necessidades (hipóteses), perguntas
   de diagnóstico e abordagem consultiva, com lista de fontes.
5. Extrai no mesmo processamento até três eventos explícitos, **apenas se houver
   citação literal** no trecho da publicação e origem HTTPS correspondente.
6. Insere os acontecimentos válidos **como pendentes**, nunca aprovados, no
   armazenamento local G4 ou no Supabase G4.3 (apenas após a migração).
7. Permite clicar **Usar fonte no G4** para conferir a origem e repetir ou
   aprofundar a classificação de um texto específico.

O G4 mantém revisão humana com confirmação da fonte; não cria automaticamente
oportunidade, não altera estágio e não envia mensagem a prospect.

## Limites e integridade

- Somente **nome e cidade** são enviados para motores de busca externos;
  contatos, mensagens, propostas e dados privados do CRM não são enviados.
- Nenhum resultado de busca isolado equivale à leitura de uma página.
- Uma identidade compatível não substitui a validação jurídica/CNPJ.
- Se a busca falhar, o site não abrir ou não houver correspondência segura,
  o sistema apresenta a limitação e **não cria fatos artificiais**.
- Resultados antigos permanecem rascunhos locais; Production não foi alterada.
- No modo Supabase, **sem a migração G4.3**, a falha de persistência é exibida;
  nenhum fallback silencioso para localStorage.

## Como ativar no Linux

Use o instalador G4.3 existente no repositório. Ao abrir, ele atualiza a branch
do PR, verifica o motor de Garimpo em `4319`, reinicia **somente** um processo
deste checkout, sem pesquisas em execução, e religa o runtime G4 reconhecido,
escolhendo uma porta interna livre.

Mantenha o Docker WAHA e a sessão de WhatsApp em execução. Encerre apenas o
terminal da prévia em `5174` antes de abrir a nova versão.

## Validações

- `node --test runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-prospect-investigation-g1.test.mjs`
- `node --check scripts/realtalent-prospecting-agent.mjs`
- `npm run typecheck`
- `npm run build`
- Teste com empresa real e publicação pública, revisando a origem antes da aprovação.
