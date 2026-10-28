# RealTalent Agent — perfil de inferência local (Qwen3 8B)

Esta branch é a base do CRM local para uso com Ollama instalado na mesma máquina. A versão na Vercel NÃO poderá acessar automaticamente a GPU do computador.

## Configuração local
- Modelo escolhido: `qwen3:8b` (Q4_K_M, cerca de 5.2 GB em disco; memória total maior com KV cache).
- GPU NVIDIA 8 GB: começar com contexto `4096`, uma execução paralela e um modelo carregado; avaliar `8192` só após medir.
- Em shell do runtime: `REALTALENT_OLLAMA_MODEL=qwen3:8b`, `OLLAMA_URL=http://127.0.0.1:11434`, `REALTALENT_AGENT_HOST=127.0.0.1`.
- Aumento dos tempos de espera apenas nesta branch para suportar inicialização e respostas mais longas do modelo local.
- Manter `OLLAMA_HOST=127.0.0.1:11434` no serviço Ollama; NÃO abrir a porta 11434 nem 8791 para a internet ou rede sem autenticação.
- Para abrir o CRM local: executar o wrapper `abrir-realtalent-local.sh` distribuído no pacote Linux RealTalent Ollama Local; o wrapper usa uma cópia isolada desta branch e define o gateway local.

## Limitações
1. Nenhum modelo foi baixado ou atualizado na máquina do usuário remotamente. A instalação é feita executando o ZIP local no Debian.
2. Nenhuma alteração em Vercel Production, Railway ou Supabase.
3. Web search/SearXNG, RAG/persistência entre dispositivos e acesso remoto a essa GPU exigem integrações separadas e autenticadas.
4. `qwen3.5:9b` demanda de 6.6 a 7.6 GB de arquivo; com cache e runtime pode exceder 8 GB de VRAM. `qwen3.5:4b` é alternativa mais leve.
5. Validar o uso efetivo da GPU em `ollama ps` e o tempo de resposta com consultas antes de promover qualquer mudança de produção.
