# RealTalent CRM V100.93.0 — Full Page UX Audit

A V100.93.0 faz a revisão da experiência de **página inteira** nas 15 rotas principais do CRM. O objetivo é corrigir problemas que não aparecem em auditorias isoladas de componentes: excesso de largura, scroll horizontal do documento, topbar congestionada, conteúdo aberto no meio da página após trocar de módulo, filtros espremidos, painéis longos sem contexto e inconsistências entre desktop, notebook, tablet e mobile.

## Alterações

- AppShell agora expõe a rota como `data-route` e classe de escopo, permitindo correções visuais por módulo sem CSS destrutivo.
- Troca de módulo volta ao topo e sincroniza o título da aba do navegador.
- Adicionado **Pular para o conteúdo**, landmark principal focável e anúncio de mudança do título da Topbar.
- Busca global aceita **Enter** para abrir o primeiro resultado.
- Nova camada `full-page-audit-v10093.css`, carregada por último, corrige contenção, largura útil, vertical rhythm, overflow e responsividade.
- Pipeline, Território, Garimpo e Configurações passam a aproveitar melhor telas largas.
- Dashboard ganha carrossel horizontal controlado para resumos em telas pequenas, sem provocar scroll horizontal do documento.
- Follow-ups e Configurações recebem navegação/contexto sticky apenas em desktop, com fallback natural abaixo de 1180 px.
- Topbar foi reforçada para notebook, tablet e mobile sem remover ações.
- Adicionado suporte explícito a `prefers-reduced-motion`.
- Gate V100.93 cobre todas as páginas principais e os contratos da revisão.

## Compatibilidade

Nenhum contrato de dados, migration ou schema de backup foi alterado nesta release. A V100.93.0 é uma camada de UX/estrutura sobre a V100.92.0.

## QA

- 266 arquivos na auditoria sintática.
- 236 arquivos na auditoria de contratos.
- 39/39 migrations com checksum íntegro.
- 38/38 gates históricos/atuais aprovados.
- Gate V100.93: 62/62 contratos.
- Build registry-independent gerado a partir de 178 módulos TypeScript e agora incluindo todas as 45 folhas de estilo.

> Nota: o ambiente de execução não conseguiu acessar o registry npm/hosts externos, portanto a inspeção visual pixel a pixel do app renderizado fica como validação final a executar em uma máquina com as dependências disponíveis. A auditoria desta release cobre a composição integral das páginas no código e no CSS responsivo.
