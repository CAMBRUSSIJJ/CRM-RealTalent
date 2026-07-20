# V100.14 — Automações Comerciais

- Redesenho completo da aba Automações com áreas de Regras, Receitas e Histórico.
- Construtor profissional de gatilhos, condições comerciais e ações automáticas.
- Inclusão de 15 gatilhos: criação/importação de lead, mudança de etapa, atividade concluída/vencida, resultado de ligação, reunião marcada/cancelada, proposta enviada, data alcançada, lead parado, meta em risco, oportunidade ganha/perdida e execução manual.
- Condições ampliadas para responsável, tags, valor, dias sem movimentação, próxima ação, tentativas, status de evento e tipo de atividade.
- Ações ampliadas para ligação, reunião, temperatura, responsável, remoção de tag, cadências, alertas, perda e mensagens assistidas.
- 11 receitas prontas adicionadas em modo pausado e de simulação.
- Simulação por lead mostrando condições aprovadas e ações previstas sem alterar dados.
- Proteções persistidas em JSONB: modo simulação/real, cooldown, limite diário, limite de ações, prevenção de duplicidade e parada em caso de erro.
- Checagens operacionais manuais para atividades vencidas, datas alcançadas, leads parados e metas em risco.
- Prevenção de tarefas e compromissos duplicados.
- Auditoria detalhada com simulações, execuções ignoradas, falhas e restauração de atividades, eventos e alterações do lead.
- Integrações com criação/importação de Leads, Pipeline, conclusão de atividades, Ligações e Agenda.
- Migration Supabase para aceitar os novos gatilhos.
- Layout responsivo sem páginas sobrepostas.
