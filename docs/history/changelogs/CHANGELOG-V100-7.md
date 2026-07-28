# V100.7 — Central profissional de Leads

## Objetivo

Transformar a aba Leads em uma central de gestão e execução comercial, preservando a arquitetura React + TypeScript, os repositórios local/Supabase, os dados existentes e as integrações com os demais módulos.

## Implementado

- Indicadores de leads ativos, ações pendentes, registros sem próxima ação, possíveis duplicados e novas entradas.
- Visualizações rápidas para leads quentes, retornos pendentes, dados incompletos e duplicados.
- Visualizações personalizadas salvas no navegador.
- Busca ampliada por nome, empresa, telefone, e-mail, cidade, origem, responsável, notas e tags.
- Filtros por etapa, temperatura, prioridade, status, responsável, origem, cidade, tag, próxima ação e qualidade do cadastro.
- Chips para filtros ativos.
- Visualização em tabela e cartões.
- Colunas configuráveis e densidade confortável/compacta.
- Ficha lateral do lead sem saída da página.
- Prioridade comercial explicável com score e motivos.
- Histórico unificado de atividades, ligações e compromissos.
- Ações rápidas de ligação, WhatsApp, follow-up, reunião, edição e acesso ao Pipeline.
- Alteração de etapa diretamente pela ficha.
- Alertas de dados incompletos.
- Detecção de possíveis duplicados por telefone, e-mail, empresa e cidade.
- Ações em massa para mover etapa, alterar prioridade, adicionar tag, criar follow-up, arquivar e excluir.
- Exportação do resultado filtrado ou dos registros selecionados.
- Experiência mobile em cartões e ficha de tela inteira.
- Correções de contenção de largura para evitar overflow e páginas sobrepostas.

## Integrações preservadas

- Pipeline.
- Follow-ups.
- Ligações e modo de ligação.
- Agenda.
- Automações.
- Importação e exportação.
- Repositório local e Supabase.
- Permissões, auditoria e segurança da fundação V100.4.
