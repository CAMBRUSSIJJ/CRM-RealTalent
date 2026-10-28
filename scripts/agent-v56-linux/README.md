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

## Pesquisa automática na V5.6 (instalador atualizado)

`abrir-local.sh` agora tenta iniciar SearXNG automaticamente usando Docker, quando a API JSON local não está pronta. Não instala Docker automaticamente, não exige sudo e não interrompe o CRM se o Docker estiver indisponível. O contêiner oficial `realtalent-searxng-local` fica vinculado somente a `127.0.0.1:8888`, com `search.formats: [html, json]`.

Se preferir iniciar só a pesquisa, sem mexer no CRM:
```bash
bash scripts/agent-v56-linux/iniciar-pesquisa.sh
```

Depois, reinicie o launcher para que o gateway receba a variável `REALTALENT_RESEARCH_SEARXNG_URL` no processo novo. O histórico de chat deixa de incluir uma cópia extensa do roteiro, que continua disponível no documento ativo.

Verificação manual:
```bash
curl -fsS 'http://127.0.0.1:8888/search?q=Thiago%20Reis&format=json' | head -c 300
curl -fsS http://127.0.0.1:8792/tools/health
```
Se o JSON de busca não estiver disponível, use `docker logs --tail 80 realtalent-searxng-local` para diagnosticar. O serviço usa buscadores públicos, que podem bloquear ou limitar consultas.
