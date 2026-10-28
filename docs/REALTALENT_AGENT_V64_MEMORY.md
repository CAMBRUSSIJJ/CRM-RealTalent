# RealTalent Agent V6.4 — Memória local e continuidade entre conversas

## O que muda
- Histórico das últimas 24 conversas concluídas (até 16 trocas por conversa) persistente no navegador.
- Comandos na interface: nova conversa, recuperar conversa anterior, apagar conversa, consultar memória.
- O Agent busca trechos relevantes em conversas e documentos de trabalho já salvos quando a nova pergunta se relaciona ao mesmo assunto. Memória recuperada é tratada como contexto não confiável, nunca como instrução do sistema.
- Arquivo de até 12 documentos ativos com revisões existentes, recuperáveis por título no painel.
- Preferências explícitas: usuário escreve e clica "Guardar preferência"; nenhuma correção é convertida automaticamente em regra permanente.
- Controle para excluir preferências, conversas e referências a documentos; limpeza da memória local inteira (não modifica dados oficiais do CRM).

## Privacidade e limites
- Chaves de localStorage segregadas por workspace e ID de usuário autenticado. Sem identidade, não persistimos memória.
- A memória é armazenada NO PERFIL DO NAVEGADOR em texto local (não criptografado). Não sincroniza entre máquinas, outros navegadores nem Vercel.
- Trechos recuperados são enviados somente ao runtime do Ollama local como contexto. A ferramenta de pesquisa pública usa consultas independentes e não envia memórias pessoais ao SearXNG.
- A seleção é lexical (termos coincidentes), não embedding vetorial ou RAG. Pode perder relações semânticas indiretas.
- Documentos são referências locais; remover uma referência na biblioteca não apaga arquivos originais, registros do CRM ou versões gerenciadas por outro mecanismo.
- Dados do CRM e operações mutáveis continuam sujeitos às permissões e confirmações originais. A memória não cria tarefas, mensagens ou ações automaticamente.
- O usuário pode apagar a memória local; também pode remover todos os dados do site pelas configurações do navegador.
- Não altera Supabase nem produção. Para sincronização entre dispositivos, será necessário backend próprio com políticas RLS, autenticação e consentimento específico.

## Instalação no Linux
Clone a branch feat/realtalent-agent-v64-local-memory-20261028 e execute:
  bash scripts/agent-v64-linux/abrir-local.sh
URL: http://127.0.0.1:4196 | gateway 127.0.0.1:8802 | Ollama 11434 | SearXNG 8888
A versão V6.3 na porta 4195 permanece preservada.

## Validação de aceitação
1. Conversa sobre jardinagem, feche/reabra Firefox ou recarregue a página e confira recuperação.
2. Clique Nova conversa, pergunte sobre jardinagem; confira que o Agent acessa somente os trechos da memória deste usuário/workspace.
3. Salve explicitamente "Prefiro respostas curtas e consultivas". Faça nova conversa e verifique que o contexto enviado ao modelo contém essa preferência.
4. Salve um documento e recupere na biblioteca da memória.
5. Mude de workspace/usuário e verifique que nada do anterior aparece.
6. Apague uma preferência e uma conversa e confirme que não são mais recuperadas. Limpeza total não deve tocar o CRM.
7. Simule storage cheio/desabilitado e confira mensagens sem travar a conversa.
8. Verifique reentrada após recarregar, navegação no Firefox, efeito em histórico de revisões.
