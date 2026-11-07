# RealTalent G4.7 — Análise comercial individual de publicações (Ollama local)

**Situação:** implementação na branch do PR #78; não publicada em Production.
Não utiliza a API Meta, credenciais do Instagram ou serviço pago de IA.

## Como usar

Garimpo → Revisar → Guiada → selecione a empresa →
**Pergunte à IA sobre esta empresa → Analisar publicações**.

O RealTalent recupera até 10 referências relacionadas à empresa, seleciona
até 6 URLs públicas indexadas de posts ou Reels e executa Qwen3 8B via Ollama.

Para cada publicação com evidência textual suficiente, exibe:
- Link para a publicação;
- Tipo de evidência: **prévia indexada**, **metadados públicos** ou
  **trecho de página realmente lido**;
- Citação literal do texto recuperado;
- Fato observado na citação;
- Leitura do posicionamento e da mensagem comercial;
- Hipótese comercial a validar;
- Pergunta consultiva sugerida.

O backend rejeita citações que não existem literalmente na evidência
recebida, IDs inexistentes e respostas duplicadas. Nenhum resultado é aprovado
como evento-gatilho do G4 nem encaminhado automaticamente ao Pipeline.

## Limites importantes

O Ollama interpreta texto e imagens, mas **não tem acesso próprio ao
Instagram**. Por isso, quando o Instagram não permite ler a publicação,
a análise se limita ao trecho indexado por buscadores, sem acesso a
fotografias, vídeos, comentários ou ao histórico completo. O indicador
"0 páginas lidas" continua correto nesses casos.

Se você quiser análise visual, abra o post no Firefox, faça uma captura de
tela e use o campo **Captura do Instagram** na mesma ficha. O recurso opcional
usa um modelo de visão local no Ollama, sem enviar a imagem à Meta.

A existência de uma campanha, inauguração ou serviço descrito no resultado
público não comprova necessidade de compra, orçamento ou intenção comercial.

## Verificação

```bash
curl --noproxy '*' -sS http://127.0.0.1:4319/api/prospecting-agent/health
curl --noproxy '*' -sS http://127.0.0.1:8791/tools/company-ask/status
node --test runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-instagram-post-analysis-g47.test.mjs
```

Depois execute os testes do projeto: `npm run typecheck` e `npm run build`.

## Atualização da prévia Linux

Pare somente o processo que mantém a prévia CRM aberta na porta 5174.
Mantenha o Docker WAHA funcionando. Execute
`~/Downloads/RealTalent-G43/start-linux.sh`, que deve buscar a branch
`feat/garimpo-trigger-intelligence-g43-supabase-20261106` do PR #78.

Se houver mudanças locais não versionadas, preserve os dados do Garimpo
e corrija o bloqueio antes de continuar. A migração G4.3 de Production
permanece pendente.
