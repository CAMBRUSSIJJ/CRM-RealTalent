# RealTalent CRM — Configurações S3.1 / S3.2

Data: 2026-10-29
Base: feat/realtalent-settings-s1s2-automation-ux-20261029
PR: #21

## Objetivo
Corrigir os problemas observados na gravação das Configurações:
- IA com indicadores sem separação visual consistente, textos e estados comprimidos.
- Terceira navegação lateral no WhatsApp.
- Repetição de títulos, orientações e status em mais de um cartão.
- Menu de Configurações extenso, com 16 seções abertas e rolagem pouco previsível.

## Implementação
1. **RealTalent AI**: reconstruído em quatro seções sem alteração das operações:
   - Estado confirmado do Agent com consulta real de Ollama e modelo.
   - Contexto utilizado pelo CRM, com contagens legíveis.
   - Ferramentas catalogadas: pesquisa, filtro Habilitadas/Reservadas e estados declarados.
   - Auditoria local com seis execuções inicialmente visíveis e opção para expandir.
   - Cartões em duas colunas no desktop de tamanho médio, quatro em telas grandes e uma no celular.
2. **WhatsApp**:
   - Substituição da terceira sidebar por seis abas em faixa horizontal rolável.
   - Cabeçalho com estado operacional legível e ação contextual de recuperar gateway local.
   - A conexão QR, Cloud API, templates, equipe, mensagens e diagnóstico não foram removidos.
   - Nunca reiniciar serviço sem ação explícita do usuário.
3. **Configurações gerais**:
   - Navegação agrupada em Minha experiência, Workspace, Vendas, Conexões, Inteligência e Administração.
   - A categoria correspondente à rota inicial é expandida; as demais começam recolhidas.
   - Links de pesquisa navegam para o campo ou seção e posicionam o conteúdo corretamente.
   - Um cabeçalho contextual por seção (nome, escopo, descrição breve); remoção do segundo cartão explicativo redundante.
   - Salvamento visual automático permanece opcional e limitado às seções autorizadas pela S1/S2.
4. **CSS isolado**:
   - src/styles/settings-s3.css, importado após settings-automation-s1s2.css.
   - Não altera o Design System das demais telas.
   - Breakpoints incluem 1280×720 e 1920×1080, mas o aceite visual real ainda é necessário.

## Segurança e limitações
- Nenhuma nova permissão de CRM, escrita automática ou conexão externa.
- O diagnóstico do modelo reporta healthcheck, não garante execução de ferramentas.
- Estado WhatsApp diz respeito à conexão; templates cadastrados não significam envio disponível.
- Regras de backup, restauração, Pipeline, permissões e sincronização S1/S2 foram preservadas.
- O vídeo não mostrou todas as telas em uso aprofundado; S3.1/S3.2 não deve ser considerada homologação visual completa.
- PR em rascunho e Production inalterada.

## QA
Workflow: .github/workflows/garimpo-g1g2-qa.yml
- TypeScript e build aprovados.
- 99 Vitest + 18 Node aprovados (117).
- CI #40903300829: https://github.com/CAMBRUSSIJJ/CRM-RealTalent/actions/runs/40903300829
- Testes novos: src/features/settings/settings-s3-navigation.test.ts

## Aceite no Firefox
1. Abrir a branch no Linux e visitar http://127.0.0.1:4197.
2. Em Configurações > RealTalent AI, conferir valores e textos sem sobreposição a 1280×720.
3. Testar os filtros Todas/Habilitadas/Reservadas e a pesquisa de ferramentas.
4. Validar auditoria expandida/recolhida e saúde do Ollama conectado/desconectado.
5. Em Configurações > WhatsApp, abrir cada uma das seis abas horizontais.
6. Verificar acesso à opção Recuperar serviço somente quando o gateway local estiver offline.
7. Percorrer as 16 áreas: o grupo correto deve expandir e a tela rolar para o início.
8. Testar busca por configuração e navegação via link direto.
9. Conferir com zoom 100% e 125%, Firefox desktop e resolução 1280×720.
10. Garantir que nenhuma edição pendente foi perdida ao alternar de seção.

## Linux
Branch: feat/realtalent-settings-s3-visual-navigation-20261029
Inicializador: scripts/garimpo-g1g2-linux/abrir-com-diagnostico.sh
Porta web: 4197 (fechar a versão anterior que usa a mesma porta).
