# Changelog V100.37 — Homologação, Arquitetura e Estabilidade

- React + TypeScript + Vite formalizados como única fonte oficial.
- Removido o patch de runtime específico da V100.36.
- Standalone passa a ser gerado dinamicamente da mesma fonte e recebe marcador verificável.
- Adicionados guards de fonte e arquitetura.
- Migrations protegidas por checksums e auditoria de RLS/SECURITY DEFINER.
- Adicionado plano de homologação, matriz de permissões, ADRs e separação de ambientes.
- CI reforçado e workflow de candidato de release criado.
- Deploy Supabase atualizado para publicar também o dispatcher de webhooks.
- Manifesto de release e relatório completo de homologação automatizados.
