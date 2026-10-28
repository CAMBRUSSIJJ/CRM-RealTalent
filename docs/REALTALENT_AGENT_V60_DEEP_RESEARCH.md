# RealTalent Agent V6.0 — Pesquisa aprofundada e chat contextual

## O que esta versão efetivamente implementa
- Pesquisa pública via SearXNG com até 2 consultas por solicitação, ordenação por relevância, diversidade de domínios e deduplicação.
- Leitura de até 4 páginas HTTPS com DNS validado e conectado ao IP verificado (bloqueio de loopback, IPs privados, cloud metadata, HTTP e redirecionamentos inseguros).
- Extração de texto legível, limites de bytes/tempo, sem autenticação, cookies ou scripts. PDFs, YouTube e páginas dinâmicas podem ficar em modo *apenas resumo da busca*.
- Qwen3 8B analisa evidências e compara opções, marca citações [1], [2] e sinaliza se a qualidade das fontes é parcial. Não apresenta inferência como pesquisa comprovada.
- Follow-ups contextuais ("compare as abordagens", "com base nisso"), tema de pesquisa mantido na sessão, documentos comerciais versionados da V5.3 e edição da V5.6.
- Resultados em texto com referências clicáveis, lista de fontes recolhida e aviso "Página lida" versus "Apenas trecho da busca".
- Consultas abertas não reconhecidas pelas regras legadas são encaminhadas ao chat Ollama somente leitura, preservando executor autorizado para mutações.

## O que NÃO foi concluído
- Não há streaming token a token nem interface idêntica ao ChatGPT.
- Não há agente de ferramentas livres/indefinidas; pesquisa é um fluxo limitado e seguro. Executor de CRM continua separado.
- RAG vetorial/PDF e memória Supabase entre dispositivos da V5.3 ainda exigem migração e indexação; não foram ativados no banco.
- Sem browser renderizado para páginas JavaScript, login em redes sociais, legendas ou transcrição YouTube.
- Não houve deploy em produção, Railway, Supabase ou mudança no Ollama da máquina da pessoa.
- Um modelo 8B pode não finalizar análises longas em 60 segundos; nesses casos a resposta é explicitamente parcial.

## Como abrir uma cópia isolada no Debian
Use a branch feat/realtalent-agent-v60-deep-research-chat-20261028 e execute:
  bash scripts/agent-v60-linux/abrir-local.sh
A aplicação será aberta em http://127.0.0.1:4192; gateway 127.0.0.1:8794 / 8795; Ollama e SearXNG continuam locais em 11434/8888. O CRM anterior na porta 4189 permanece intacto.

## Critérios para validar manualmente
1. Pesquisar "Thiago Reis Growth Machine scripts" e confirmar que fontes de blog aparecem antes de vídeos genéricos.
2. Confirmar no painel quais páginas foram lidas e quais são snippets.
3. Perguntar "Compare as abordagens e adapte ao meu negócio de jardinagem", conferir histórico e adaptação original.
4. Converter roteiro em tabela e voltar a uma versão anterior.
5. Simular desligar SearXNG e Ollama: nenhum sucesso falso.
6. Validar bloqueio de IP local, redirecionamentos, payload malicioso e navegação Firefox.
7. Antes de produção: testes E2E autenticados, QA do tempo e do consumo de VRAM, revisão de isolamento por usuário/workspace.
