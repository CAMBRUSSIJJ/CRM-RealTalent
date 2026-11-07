# G4.3 — implantação controlada

Estado: PR #78, sem atualização do banco Supabase nem de Production.

## O que faz
- Eventos de fontes públicas são salvos em `prospecting_trigger_events` por workspace.
- Entram sempre como `needs_review`. A revisão exige conferência humana.
- As decisões geram linhas imutáveis em `prospecting_trigger_reviews`.
- O Pipeline mostra apenas sinais aprovados, associados a um lead que possua tag de importação de Garimpo.
- As necessidades comerciais continuam marcadas como hipóteses.

## Controles do banco
A migração `202611060001_g43_trigger_events_review_audit.sql` implementa RLS,
vinculação ao prospect no mesmo workspace, proibição de editar evidências depois de criadas,
confirmação obrigatória para aprovar e histórico de revisão sem gravação direta pelo cliente.

A suíte `supabase/tests/g43_trigger_rls.sql` usa PostgreSQL isolado,
com testes negativos para acesso cruzado, associação indevida e alteração de auditoria.

## Operação
O ambiente local Linux usa `VITE_DATA_MODE=local`; serve para testar a interface.
A sincronização compartilhada requer modo `supabase`, usuário autenticado e migração aplicada.
O código não importa automaticamente como aprovados registros antigos do navegador.
Se a tabela não existir, exibe erro e não produz uma falsa confirmação de sincronização.

## Próximas validações antes de Production
1. Backup do banco e revisão de permissões reais de owner/admin/member/viewer.
2. Testar aplicação da migração em staging, inclusive RLS e grants da Data API.
3. Conferir que o vínculo com o lead preserva a tag de origem do Garimpo.
4. Executar advisors de segurança e performance e validar o fluxo até o Pipeline.
5. Só depois publicar em Production.

Os seis arquivos históricos que faltavam no lock de migrações foram registrados com
seus checksums; seu conteúdo SQL não foi modificado.
