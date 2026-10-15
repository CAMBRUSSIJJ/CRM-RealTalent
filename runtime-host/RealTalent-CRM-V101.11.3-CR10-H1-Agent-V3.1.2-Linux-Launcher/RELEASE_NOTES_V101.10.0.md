# RealTalent CRM V101.10.0 — Settings Experience 2.0

## Objetivo

Transformar Configurações em uma área única, previsível e profissional, reduzindo densidade visual sem remover capacidades.

## Entregue

- novo SettingsShell em duas colunas;
- navegação agrupada em Minha experiência, Workspace, Vendas, Conexões, Inteligência e Administração;
- grupos recolhíveis;
- busca que localiza seções e controles e navega diretamente até eles;
- saúde do sistema sob demanda, removendo a terceira coluna fixa;
- padrão único de botões, inputs, selects, toggles, panels e save bar;
- Notificações reorganizadas em Canais → Eventos → Horários;
- Navegação com preview sticky e editor mais compacto;
- Equipe separada da matriz de permissões;
- Permission Matrix resumida nas ações principais e detalhes avançados recolhíveis;
- Pipeline e comercial com subnavegação Operação / Inteligência / Pipeline;
- Integrações com fluxo de usuário Conexões / Contas e Centro técnico opcional;
- Dados e segurança com âncoras claras para backup e proteção;
- Aparência H4, WhatsApp, Agenda, Maps, AI, auditoria e demais capacidades preservadas.

## Compatibilidade

- nenhuma migration nova;
- 49 migrations preservadas;
- Workspace Appearance H4 preservado;
- modelo canônico, Event Bus, Workflow Runtime, Permission Matrix e Extension Registry preservados;
- sessão de Comunicação/WhatsApp é migrada primeiro da H4 quando encontrada.


## QA

- Settings Experience 2.0: 27/27 contratos;
- Release Manifest: 27/27;
- Capability Matrix: 16 capacidades;
- Repository parity: Local 96/96 e Supabase 96/96;
- migrations: 49/49;
- `check:legacy`: 3.185 OK / 0 FAIL;
- instalação de dependências no ambiente de montagem expirou por rede; typecheck/Vitest/build globais permanecem no launcher Linux.
