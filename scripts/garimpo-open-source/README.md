# Garimpo Open Source G5 — prévia local

Integração opcional com **Crawl4AI 0.9.5**, **ScrapeGraphAI 2.3.1** e **Ollama/Qwen3 8B**.
Branch de origem: feat/garimpo-trigger-intelligence-g43-supabase-20261106.
Não promove nenhuma alteração para Production; não altera RLS, WAHA, pipeline ou migrações.

## Funcionamento

O Garimpo continua pesquisando empresas e validando URLs. O leitor de investigação
crm-prospect-investigation-g1.mjs passa a chamar crm-open-source-reader-g50.mjs.
Com a flag ativa, ele faz HTTPS com DNS pinning pelo leitor original,
envia apenas HTML público ao subprocesso Python e recebe texto processado pelo
Crawl4AI. O Python não recebe URLs: processa HTML local, sem JavaScript,
com scripts, iframes, atributos e recursos externos removidos.

ScrapeGraphAI (opcional) executa extração adicional com Ollama local. Apenas
fatos cuja citação literal esteja no conteúdo realmente lido são aceitos;
nenhuma oportunidade é aprovada automaticamente.

Se dependências, navegador ou worker falharem, a investigação mantém
o leitor anterior. Não são enviados contatos, notas de CRM ou leads privados.

## Instalação Linux (Python 3.12+)

~~~bash
git clone --branch feat/garimpo-open-source-crawl4ai-scrapegraph-20261110 \
  https://github.com/CAMBRUSSIJJ/CRM-RealTalent.git ~/Downloads/CRM-RealTalent-Garimpo-G5
cd ~/Downloads/CRM-RealTalent-Garimpo-G5
bash scripts/garimpo-open-source/instalar-linux.sh
node --test runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-open-source-reader-g50.test.mjs
python3 -m py_compile scripts/garimpo-open-source/worker.py
~~~

O instalador cria venv apenas em
~/.local/share/realtalent-open-source-garimpo/venv.
Bibliotecas e Chromium exigem rede, espaço em disco e RAM durante instalação.

## Ativar pesquisa local

Para iniciar o Agent com Crawl4AI neste checkout, encerre primeiro a prévia
antiga que estiver usando a porta 8791. Não force processos desconhecidos.
Depois:

~~~bash
cd ~/Downloads/CRM-RealTalent-Garimpo-G5
export REALTALENT_GARIMPO_OPEN_SOURCE=1
export REALTALENT_GARIMPO_SCRAPEGRAPH=0
bash scripts/garimpo-g4/ativar-garimpo-local.sh
bash scripts/garimpo-g4/ativar-agente-local.sh
~~~

Se o script disser que o Agent antigo já está pronto, ele não foi reiniciado
e poderá continuar sem a nova integração. Reinicie apenas o Agent identificado
do checkout de prévia e verifique que a variável está ativa no seu processo.

Após testar o Crawl4AI, habilite o ScrapeGraphAI:

~~~bash
export REALTALENT_GARIMPO_SCRAPEGRAPH=1
~~~

Reinicie apenas o Agent. Isso executa uma inferência adicional do Qwen e pode
consumir mais memória, por isso começa desativado.

## Validação funcional

1. Garimpo > pesquisar empresa > Revisar > investigação.
2. Conferir identidade da empresa, fonte, URL e trecho literal.
3. Sem evidências suficientes, não aprovar hipótese ou sinal automaticamente.
4. Desativar com REALTALENT_GARIMPO_OPEN_SOURCE=0 e reiniciar o Agent para voltar ao leitor anterior.

## Limites

- Apenas um processamento Crawl4AI simultâneo; demais páginas usam o leitor antigo.
- HTML até 380 KB; execução do subprocesso com timeout de 45 segundos.
- Busca externa HTTPS com DNS pinning pelo leitor Node existente.
- Sem necessidade de API paga do ScrapeGraphAI.
- Páginas são dados não confiáveis, jamais instruções para o CRM.
- Navegação dinâmica com JS, logins e páginas privadas ficam para uma etapa futura.
