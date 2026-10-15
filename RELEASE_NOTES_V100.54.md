# V100.54.0 — Account Intelligence & Territory

## Objetivo
Transformar o CRM de uma visão apenas lead-centric para uma base **Lead + Account**, preparando o contexto de empresa e stakeholders que será utilizado na futura evolução da Central de Ligações.

## Entregas
- Account 360 dentro da ficha do lead.
- Buying committee expandido: decisor final/econômico, champion, Financeiro, Compras, avaliador técnico, influenciador, operacional, usuário, gatekeeper e blocker.
- Força do relacionamento, postura, influência, score, notas, contato principal e responsável pelo relacionamento.
- Relações internas entre stakeholders.
- Cobertura da conta, risco de relacionamento, gaps e próxima ação recomendada.
- Histórico de interação por pessoa através de `contactId` em atividades, ligações e eventos.
- Território sem chave obrigatória do Google Maps.
- Fallback de localização por estimativa transparente quando geocodificação externa não estiver disponível.
- Território exibe cobertura/stakeholders da conta e abre o Account 360 diretamente.
- Backup/restauração preserva stakeholders e relações.
- Migration V100.54 com RLS, índices, relações e compatibilidade dos registros históricos.

## Fora do escopo desta release
A nova experiência de **Sessões/Central de Ligações** foi deliberadamente deixada para a próxima etapa. Esta release constrói a camada de Account Intelligence que alimentará essa tela.
