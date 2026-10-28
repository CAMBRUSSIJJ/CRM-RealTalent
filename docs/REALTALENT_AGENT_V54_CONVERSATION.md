# RealTalent Agent V5.4 — conversa contínua, modelo real e não comandos disfarçados

## O problema
A V5.3 exibiu na captura a saída do Script Studio e o documento ativo, mas não se comportou como um chat real. A Vercel compilou o frontend, enquanto o serviço Railway \`realtalent-runtime\` permanece preso ao commit antigo f971b7e... e Ollama está limitado a aproximadamente 1GB de RAM (CPU 2); não houve atualização efetiva do modelo no Railway.

## Nesta PR
- Exibição dos turnos anteriores no painel e memória da sessão ampliada de 6 para 16 turnos, respeitando o escopo workspace/usuário.
- Perguntas informativas não operacionais entram no modo de conversa com o modelo local, em vez de ser tratadas como ação CRM.
- Novo endpoint local isolado \`POST /tools/chat\`, com contexto, limites de tempo e sem ferramentas nem escrita de CRM.
- Sem servidor configurado, informar indisponibilidade; jamais inventar um conteúdo como se o Ollama tivesse respondido.
- Roteiros, métricas e ações autorizadas continuam usando seus próprios executores.

## Limites importantes
- O frontend Preview da Vercel sozinho NÃO ativa o Ollama ou o novo endpoint. O runtime Railway antigo precisa ser atualizado em ambiente de teste com autenticação. NÃO mesclar ou promover esta PR diretamente.
- Sem streaming de tokens nesta versão: as respostas são completas e preservam histórico.
- O chat não pesquisa na internet automaticamente; pesquisa exige integração autorizada e verificação de fontes.
- O modelo padrão no código ainda é \`qwen3:4b\`; nenhuma alteração foi efetuada no serviço real Ollama. Não tentar rodar Qwen 8B em Railway com 1GB.
- Repositório e Preview contêm somente mudanças preparatórias. Validar SSO, permissões, RLS e custos antes de expor.
