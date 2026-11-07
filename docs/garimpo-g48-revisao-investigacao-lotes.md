# RealTalent G4.8 — Revisar empresas e análise em lote com Ollama

**Entrega no PR #78 (branch de desenvolvimento).** Não publicada em Production.
Nenhuma migração foi aplicada ao Supabase principal e nenhuma configuração do WAHA foi alterada.

## Revisão empresarial em quatro etapas

Em **Garimpo → Revisar → Guiada**, a ficha da empresa agora tem quatro
abas principais:

1. **Resumo** — cinco verificações, avisos e, abaixo, detalhes recolhíveis de
   localização, evidências, confiança, duplicidade e proveniência.
2. **Investigação com IA** — chat com o Ollama, consulta ao Instagram público,
   CNPJ e serviços, análise de publicações em lote, resultados com citações e
   dados do G1/G2 recolhidos por padrão.
3. **Inteligência comercial** — sinais G4, evidências e aprovação humana;
   clicar em “Usar fonte no G4” a partir da investigação abre esta aba.
4. **Decisão e cadastro** — edição cadastral, bloqueios e decisões.

A lista de empresas fica à esquerda; os detalhes técnicos não ocupam a largura
lateral da investigação. Os botões de aprovar, reanalisar, descartar e enviar
continuam sujeitos às regras e permissões existentes. Trocar de aba não elimina
a conversa da empresa enquanto ela permanecer selecionada.

## Análise em lote de Instagram

Clique em **Analisar publicações** na aba Investigação:

- O Garimpo pesquisa o nome e cidade da empresa, além de buscar publicações
  e Reels indexados em consultas específicas.
- Até **16 referências** podem ser apresentadas; até **12 posts/reels**
  com prévias utilizáveis entram na análise.
- O Qwen3 8B local interpreta dois lotes sequenciais de até 6 itens,
  sem concorrência entre modelos no computador.
- Cada análise exige citação **literal do texto disponível naquela fonte**.
- Aparecem: assunto, fato observado, leitura da mensagem comercial,
  hipótese de necessidade e pergunta consultiva.
- O painel mostra quantos posts foram **indexados**, quantos foram
  **efetivamente analisados** e quantas páginas foram realmente lidas,
  além das frequências de temas entre os posts analisados.

### O que NÃO é possível sem acesso autorizado

Ollama é motor de **análise**, não um cliente de Instagram. A pesquisa pública
não lê o feed inteiro, comentários privados, imagens ou vídeos de URLs que
exigem login. Quando há só resultado de buscador, a origem deve ser
identificada como **prévia indexada**, não como postagem completa.

Capturas de tela fornecidas manualmente podem ser analisadas com o modelo
visual local (opcional), sem usar a API da Meta.

Os resultados **não criam nem aprovam automaticamente** eventos-gatilho
no G4 e não alteram o Pipeline ou enviam mensagens.

## Como abrir no Linux

1. Feche somente o terminal que executa a prévia CRM na porta `5174`.
   **Mantenha Docker WAHA e WhatsApp conectados.**
2. Abra o terminal e execute:

```bash
cd ~/Downloads/RealTalent-G43 || exit 1
curl -fL --retry 3 \
  "https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/feat/garimpo-trigger-intelligence-g43-supabase-20261106/deploy/waha-direct/instalar-e-abrir-ia-audios-linux.sh" \
  -o start-linux.sh
chmod +x start-linux.sh
./start-linux.sh
```

3. Acesse `http://127.0.0.1:5174/#/prospecting` e entre em
   **Revisar → Guiada → Investigação com IA → Analisar publicações**.

O inicializador verifica o Agent G4.8 na porta `8791` e o motor de busca
G4.8 na porta `4319`, atualizando apenas serviços reconhecidos desse
checkout e preservando estado local e processos em andamento.

## Testes

```bash
node --test runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-instagram-batch-g48.test.mjs
node --test runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-instagram-post-analysis-g47.test.mjs
npm run typecheck
npm run build
```

As políticas RLS e a migração G4.3 continuam sendo validadas em PostgreSQL
isolado. A persistência compartilhada não funciona em Production sem aprovação
e aplicação da migração.
