# Changelog V100.17 — Revisão Geral, Segurança, Performance e Produção

## Consolidação

- revisão das 12 áreas do CRM como um fluxo único;
- manutenção do carregamento modular por rota no build de produção;
- atualização centralizada da versão para V100.17;
- remoção dos artefatos standalone antigos da entrega final.

## Integridade e dados

- novo diagnóstico do workspace em Configurações;
- detecção de leads sem etapa, atividades/ligações/eventos órfãos, datas inválidas, metas inconsistentes e automações sem ações;
- detecção de possíveis duplicidades por telefone, e-mail, empresa e cidade;
- correção do indicador de vendas do mês para considerar mês e ano;
- backups locais e Supabase passam a usar o esquema 100.17;
- base local corrompida é preservada em uma cópia de recuperação antes da restauração segura;
- slugs de workspace agora são únicos.

## Segurança

- normalização rigorosa de preferências, cores, horários, rotas, listas e limites numéricos;
- armazenamento local com fallback controlado e diagnóstico de persistência;
- Content Security Policy e políticas adicionais em `vercel.json`;
- auditoria automática de release contra HTML inseguro, eval, marcadores pendentes e versão antiga ativa;
- auditoria das dependências de produção sem vulnerabilidades encontradas.

## Performance e estabilidade

- build de produção mantém divisão modular por rota;
- standalone usa build único sem avisos de configuração obsoleta;
- teste de navegação percorre todas as áreas e verifica crash, erros de console e overflow global;
- validação específica para desktop e celular.

## Testes

- 67 testes automatizados em 16 arquivos;
- integração completa entre Lead, Pipeline, Follow-up, Ligação e Agenda;
- auditoria de 92 arquivos ativos da aplicação;
- smoke test completo no Chromium;
- build TypeScript/Vite aprovado.
