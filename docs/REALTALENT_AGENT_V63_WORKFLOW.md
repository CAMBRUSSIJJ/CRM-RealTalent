# RealTalent Agent V6.3 — Fluxo contextual de análise e plano

## Implementado
- Combina ferramentas de leitura em uma mesma solicitação: resumo agregado e autorizado dos leads do CRM, pesquisa pública de mercado (quando solicitada) e elaboração de um plano pelo Qwen3 8B local.
- O planejador Qwen recebe apenas o texto da pergunta e devolve uma sequência estritamente validada de três ferramentas possíveis: crm_summary, web_research e draft_document.
- Os dados do CRM são filtrados pelo workspace e permissão: administradores veem os totais do workspace; demais perfis veem apenas leads atribuídos ao usuário. Sem identidade autenticada, não há consulta.
- O resumo enviado ao modelo é agregado, sem nomes, telefones, emails, notas ou outros identificadores de clientes.
- A consulta externa vem de um pequeno vocabulário de setores públicos; nenhum registro do CRM é enviado ao SearXNG.
- O Qwen3 8B recebe localmente o resumo agregado, os resultados verificados da pesquisa, o histórico recente e o documento ativo; entrega uma resposta e um plano de trabalho.
- O plano entra no sistema existente de revisões de documento. Salvar nos Playbooks continua a exigir clique explícito.
- Erros de modelo não substituem o documento anterior por um roteiro genérico.

## Limites
- Não há agente autônomo ilimitado, nem liberação de envio de mensagens e gravação de tarefas sem confirmação.
- O planejador apenas inicia fluxos compostos com referência explícita ao CRM e a um entregável analítico.
- A pesquisa externa cobre um conjunto inicial de setores. Pedidos fora desse conjunto produzem um plano local sem alegar pesquisa realizada.
- O plano é armazenado como documento compatível com o Script Studio para manter o versionamento da V6.1; a migração para tipo de documento independente fica para versão posterior.
- A síntese é local. Ela não possui dados de clientes ou métodos de pesquisa que não foram recuperados de verdade.
- A versão não foi publicada no Vercel Production nem Railway.

## Teste no Linux
A branch feat/realtalent-agent-v63-contextual-workflow-20261028 abre pelo script:
  bash scripts/agent-v63-linux/abrir-local.sh
Endereço http://127.0.0.1:4195, gateway 127.0.0.1:8800; Ollama e SearXNG continuam em 11434 e 8888.
Valide: "Analise meus leads do CRM, pesquise o mercado de jardinagem e crie um plano comercial com prioridades". Depois: "Detalhe as ações do plano" e "Adapte o plano para apresentação".
Teste os fluxos de falta de permissão, ausência de busca, queda do Ollama e atualização do histórico. A V6.2 permanece isolada na porta 4194.
