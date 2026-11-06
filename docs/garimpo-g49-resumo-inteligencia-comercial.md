# RealTalent G4.9 — Síntese e priorização comercial na revisão

**Implementação:** PR #78 (prévia local). Não publicada em Production.
**Ollama:** Qwen3 8B permanece como interpretador das publicações; a priorização posterior
é determinística, auditável e não exige uma terceira chamada de modelo.

## Experiência

Garimpo → Revisar → Guiada → Investigação com IA → **Analisar publicações**.

O resultado padrão apresenta:
- **Síntese executiva** com cobertura da investigação;
- Até **3 descobertas para investigar**, selecionadas pelo valor informacional;
- Evidência literal, leitura comercial e hipótese explicitamente não confirmada;
- Até **2 próximos passos** com perguntas consultivas;
- Link da fonte de cada descoberta e indicação de leitura (snippet, metadados, página).

Outros dados ficam em dois grupos **recolhíveis por padrão**:
1. Análise estratégica, padrões, cobertura e cartões individuais;
2. Publicações indexadas, fontes, limites de leitura e proveniência.

As demais consultas (CNPJ, serviços, captura enviada) preservam seus componentes
de apresentação. A comparação com a consulta anterior funciona durante a sessão
de investigação na mesma tela e compara URLs presentes nos resultados **analisados**.
Uma URL nova não demonstra que a postagem seja recente.

## Como a priorização funciona

O módulo `crm-commercial-priority-g49.mjs` recebe apenas itens do
`analyzeInstagramPostBatchesG48`, que já validou citações literais.

1. Rejeita links fora de posts/reels públicos do Instagram e resultados que não
   estiverem marcados como `analysis_only`.
2. Dá peso a **serviços específicos, mudanças, equipes, parcerias, atendimento** e
   à profundidade efetiva da evidência.
3. Reduz a prioridade de conteúdo genérico, repetitivo ou marcado como histórico.
   Inaugurações antigas não são automaticamente consideradas gatilhos atuais.
4. Deduplica fontes e evita repetir o mesmo tema na síntese executiva.
5. Retorna até três itens, com fonte, citação, pergunta e hipótese, ou conclui
   **"Não foram identificados sinais suficientemente relevantes"**.

O ranking **não é probabilidade de compra**, não identifica dores confirmadas
nem cria oportunidades automaticamente. Todas as hipóteses são revisadas
por um humano no G4 antes de afetar CRM/Pipeline.

## Limites do Instagram

Ollama não coleta sozinho dados restritos. O G4.9 sintetiza **somente o texto
realmente encontrado** na pesquisa pública (trechos indexados, metadados ou
páginas HTML públicas que possam ser lidas). Não lê todo o feed, Stories,
comentários restritos nem imagens bloqueadas.

A análise visual opcional por captura fornecida pelo usuário permanece disponível
no campo **Captura do Instagram** com o modelo visual local do Ollama, se instalado.

## Atualização Linux

Feche somente a prévia local do CRM na porta 5174, preservando o Docker WAHA.
Execute:

```bash
cd ~/Downloads/RealTalent-G43 || exit 1
curl -fL --retry 3 \
  "https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/garimpo-trigger-intelligence-g43-supabase-20261106/deploy/waha-direct/instalar-e-abrir-ia-audios-linux.sh" \
  -o start-linux.sh
chmod +x start-linux.sh
./start-linux.sh
```

Confira:
```bash
curl --noproxy '*' -fsS http://127.0.0.1:8791/tools/company-ask/status
curl --noproxy '*' -fsS http://127.0.0.1:4319/api/prospecting-agent/health
```

O primeiro serviço deve reportar `company-assistant-g49`; o motor de busca
G4.8 permanece `g48-instagram-batch-v1`.

## Validações

```bash
node --test runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-commercial-priority-g49.test.mjs
npm run typecheck
npm run build
```

Políticas RLS são testadas no PostgreSQL isolado. Nenhuma migração G4.3
deve ser aplicada ao banco de Production sem homologação com usuários
de workspaces diferentes.
