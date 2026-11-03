# RealTalent AI Local Connect — Qwen no Linux, CRM no navegador

## Perfil de menor custo

O CRM pode utilizar a IA executada no mesmo computador Linux do navegador.
Não depende de hospedagem de modelos no Railway ou Vercel e não envia pedidos de inferência a uma API paga enquanto **Usar somente IA local** estiver ativado. O Railway e a Vercel podem continuar existindo para outras funções do CRM e, por isso, suas respectivas despesas não desaparecem automaticamente.

## Instalação inicial (Debian / Ubuntu)

1. Requisitos: Node.js 22, npm, Git, curl, Ollama e `systemctl --user`.
2. Faça checkout da branch `feat/tasks-team-recipient-routing-20261102` e execute:

```bash
bash scripts/realtalent-ai-linux/ativar-ia-no-crm.sh
```

O instalador prepara uma cópia permanente em `~/.local/share/realtalent-ai/repo`, um segredo local em `~/.config/realtalent-ai/agent.env` (permissões 600), unidades de usuário para Ollama, Agent e bridge, um monitor de saúde e o atalho `~/.local/bin/realtalent-ia`. A primeira execução pode baixar `qwen3:8b` (vários GB) e instalar dependências npm.

## Todos os dias

```bash
~/.local/bin/realtalent-ia
```

O comando inicia/verifica serviços e mostra um **código de seis dígitos**, válido por cinco minutos. No **mesmo computador**, abra o CRM e acesse Configurações → RealTalent IA → IA deste computador, caso o navegador ainda não esteja pareado. O token do navegador é válido por até 90 dias e é vinculado à origem do CRM: normalmente não é preciso inserir o código novamente a cada inicialização.

Outros comandos:

```bash
~/.local/bin/realtalent-ia status
~/.local/bin/realtalent-ia test
~/.local/bin/realtalent-ia pair
~/.local/bin/realtalent-ia stop
~/.local/bin/realtalent-ia install
```

O comando `test` solicita uma geração curta ao **Ollama local**, sem rede externa de inferência.

## Segurança

- Ollama escuta apenas em `127.0.0.1:11434`; não exponha esta porta na internet.
- O navegador conversa somente com o conector autenticado na porta `127.0.0.1:8798`, usando um token diferente do segredo interno do Agent.
- A ponte do navegador aceita apenas origens explicitamente autorizadas e ferramentas de leitura/geração; ela não expõe endpoints de escrita do CRM.
- O pareamento ativa o modo **Somente IA local**. Se o computador for desligado, o CRM retorna indisponibilidade para as requisições do Agent, sem tentar provedor pago.
- Para reativar deliberadamente o fallback cloud, desmarque o modo local-only em Configurações → RealTalent IA. Isso poderá acarretar cobrança dependendo do provedor.
- Se estiver usando um domínio próprio no Vercel, configure sua origem HTTPS exata em `REALTALENT_BROWSER_ALLOWED_ORIGINS` **no ambiente local do serviço da ponte**, além das origens já permitidas. Não use coringas.

## Limitações

1. O CRM deve ser acessado no **mesmo computador Linux** em que roda o Ollama. Celular/outro notebook não consegue alcançar a porta localhost do Linux. Para acesso remoto, é preciso uma arquitetura separada com autenticação ponta a ponta (por exemplo, túnel privado).
2. A ponte funciona sem contratar modelo em nuvem. O CRM, Supabase, Railway ou Vercel podem continuar tendo seus próprios custos.
3. A primeira instalação exige conexão para clonar o repositório e baixar o modelo; o Garimpo também pode exigir internet para pesquisar sites públicos.
4. O status do Ollama não comprova qualidade da resposta. Use `realtalent-ia test` e depois envie uma pergunta no próprio chat do CRM para validar o caminho completo.
5. Não há garantia de IA quando o PC está desligado; esse é o compromisso de custo da arquitetura local.
