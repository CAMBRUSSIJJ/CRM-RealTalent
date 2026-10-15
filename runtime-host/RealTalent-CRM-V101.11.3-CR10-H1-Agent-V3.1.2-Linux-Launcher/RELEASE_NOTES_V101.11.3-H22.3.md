# RealTalent CRM V101.11.3-H22.3 — Field-Level Permissions + Approvals + Audit Log

Base: **V101.11.3-H22.2 — Cross-Module Access Control**.

## Objetivo

A H22.3 adiciona governança dentro dos registros já protegidos pela H22.1/H22.2. O perfil passa a definir não apenas qual módulo/registro o usuário pode acessar, mas também **quais campos sensíveis pode ver/editar, quais operações comerciais exigem aprovação e qual trilha de auditoria deve ser preservada**.

## Campos sensíveis

A matriz de **Equipes → Perfis e acesso** passa a controlar três níveis (`Oculto`, `Somente leitura`, `Ver e editar`) para:

- telefone;
- e-mail;
- valor da oportunidade;
- desconto de proposta;
- margem comercial;
- custo interno;
- total/TCV da proposta;
- receita.

Os perfis padrão recebem políticas distintas. Exemplo: Vendedor pode editar telefone/e-mail/valor/desconto, visualizar margem/TCV/receita e não enxerga custo interno; SDR recebe uma superfície comercial ainda mais restrita; Gestor e Administrador mantêm acesso completo.

As superfícies governadas de Contatos, ficha/drawer, Catálogo, Propostas e Receita mascaram o valor quando o perfil está em `hidden`, desabilitam escrita em `view` e liberam escrita apenas em `edit`.

## Enforcement de escrita

A proteção não fica apenas no React. `AppContext` executa `assertSensitiveField(...)` para mudanças em telefone, e-mail, valor da oportunidade, custo, desconto, margem e receita.

No modo Supabase, a migration H22.3 adiciona triggers `BEFORE INSERT/UPDATE` nos registros sensíveis e usa `rt_access_field_level(...)` para bloquear writes que não tenham nível `edit`.

## Alçadas comerciais

Cada perfil personalizado pode definir:

- desconto máximo sem aprovação;
- margem mínima sem aprovação;
- TCV máximo sem aprovação;
- se exportações exigem aprovação.

As alçadas do perfil são combinadas aos guardrails do Catálogo. Uma proposta pode exigir aprovação por uma ou mais razões ao mesmo tempo.

## Fluxo de aprovação de proposta

Quando um usuário sem permissão `approve` cria/edita uma proposta fora da alçada:

1. a proposta permanece `draft` e não oficial;
2. uma solicitação `proposal_policy` é criada;
3. o motivo fica visível na Central de Aprovações;
4. Gestores/Aprovadores podem aprovar ou rejeitar;
5. a proposta só pode avançar para `sent/viewed/accepted`, virar oficial ou fechar a oportunidade como ganha após aprovação válida.

Alterações posteriores nos itens/preço invalidam uma aprovação anterior. Um aprovador que faz override registra `proposal_policy_override` na auditoria.

## Aprovação de exportação

Contatos e Garimpo agora passam por `requireExportApproval(...)` quando a política do perfil exige aprovação. A primeira tentativa cria uma solicitação e não exporta os dados. Após aprovação, a exportação é liberada uma única vez; a aprovação é consumida e o evento `data_exported` é auditado.

## Central de Aprovações

A aba **Perfis e acesso** agora contém:

- solicitações pendentes;
- tipo (política de proposta ou exportação);
- solicitante;
- motivo;
- estado;
- Aprovar/Rejeitar para perfis com ação `approve`.

## Auditoria de segurança

A trilha H22.3 registra, entre outros:

- `access_profile_saved`;
- `access_profile_assigned`;
- `access_profile_deleted`;
- `approval_requested`;
- `approval_approved`;
- `approval_rejected`;
- `sensitive_field_changed`;
- `data_exported`;
- `proposal_policy_override`.

No modo Local a trilha é persistida no storage do workspace. No Supabase ela usa `audit_logs` e `rt_record_access_audit(...)`.

## Supabase

Nova migration:

`202610120003_v101_11_3_h22_3_field_approvals_audit.sql`

Ela adiciona:

- `field_access` e `approval_policy` a `access_profiles`;
- `access_approval_requests` com RLS;
- `rt_access_field_level(...)`;
- `rt_access_approval_policy(...)`;
- `rt_record_access_audit(...)`;
- RPCs de solicitar/decidir/consumir aprovação;
- guards de escrita de campos sensíveis;
- `rt_proposal_policy_reasons(...)`;
- enforcement de aprovação ao avançar propostas;
- invalidação de aprovação após alteração de preço.

## Limite de segurança desta fase

A H22.3 oferece **visibilidade de campos nas superfícies governadas da aplicação e enforcement de escrita no banco**. O RLS continua protegendo quais linhas cada usuário pode acessar.

Ela **ainda não implementa column-level SELECT isolation contra um cliente que faça chamadas diretas à API Supabase fora do CRM**. Um usuário que já tenha acesso RLS à linha pode, por uma chamada raw ao banco, receber a coluna original. Fechar essa fronteira exige uma próxima etapa com secure projections/RPCs ou views dedicadas e retirada do SELECT direto das colunas sensíveis. Portanto, `hidden` nesta release é uma regra forte do produto/UX e de escrita, mas não deve ser tratado como segredo criptográfico de coluna contra acesso raw ao banco.

O modo Local continua sem isolamento multiusuário real; segurança entre pessoas exige login individual + Supabase + migrations aplicadas.

## Validação

- `qa:architecture`: PASS.
- H22.1: **54/54 PASS**.
- H22.2: **75/75 PASS**.
- H22.3: **102/102 PASS**.
- H22.1 runtime: **17/17 PASS**.
- H22.2 runtime: **25/25 PASS**.
- H22.3 runtime: **33/33 PASS**.
- Source Syntax: **421 arquivos PASS**.
- Integration Contracts: **389 arquivos PASS**.
- Migrations: **57/57 checksum íntegro**.
- Release Manifest: **107/107**.
- Capability Matrix: **47 capacidades / 180 evidências / 121 executáveis**.
- Repository Contract: **100 métodos**.
- Browser E2E Contract: **11 fluxos**.
- CSS Governance: **65/65**.
- Linux preflight: **382 TS/TSX PASS**.
- Registry-independent transpile: **306 módulos PASS**.

## Gates oficiais dependentes de dependências

`npm ci` não concluiu na janela deste ambiente e não produziu `node_modules`. Portanto:

- typecheck oficial: **BLOCKED** — primeiro erro `Cannot find module 'react'` e cascata de tipagens ausentes;
- Vitest: **BLOCKED** — `vitest: not found`;
- Vite build: `validate:env` PASS, build **BLOCKED** — `vite: not found`.

O build registry-independent gera um `dist` apenas para auditoria. O bundle audit o recusou corretamente por `HTML legado reapareceu`; esse `dist` não faz parte do artefato final.

## Marker de runtime

`rt_governance=101.11.3-h22-3-field-approvals-audit`
