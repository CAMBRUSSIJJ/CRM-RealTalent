# RealTalent V5.6 no Linux (sem baixar ZIP do ChatGPT)

Esta alternativa instala via GitHub em uma cópia separada, usando Ollama e Qwen3 8B localmente.

```bash
cd ~/Downloads
git clone --depth 1 --branch feat/realtalent-agent-v56-research-editor-routing-20261028 \
  https://github.com/CAMBRUSSIJJ/CRM-RealTalent.git RealTalent-Agent-V56-Fonte
cd RealTalent-Agent-V56-Fonte
chmod +x scripts/agent-v56-linux/abrir-local.sh
./scripts/agent-v56-linux/abrir-local.sh
```

Se o repositório já estiver clonado, não clone novamente: entre na pasta e execute `git pull --ff-only`, seguido de `./scripts/agent-v56-linux/abrir-local.sh`.

O instalador verifica requisitos, baixa Qwen3 8B quando ausente, sobe o gateway local 8792 e a interface 4189. Não altera 4188 e não altera Vercel Production, Railway ou Supabase.

Pesquisa pública: requer instância local SearXNG na porta 8888 com JSON ativado. Na ausência do buscador, a pesquisa é declarada indisponível; as edições de tabela, tópicos e texto corrido não exigem busca.

Requer Node.js 22+, Git, npm, curl e Ollama instalados. A primeira execução baixa modelos e dependências, com acesso à internet. Não publique as portas do Ollama e do gateway fora do computador.
