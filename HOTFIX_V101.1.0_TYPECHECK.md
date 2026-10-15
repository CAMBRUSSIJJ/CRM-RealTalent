# V101.1.0 — Typecheck HOTFIX

Hotfix corretivo para os 8 erros TypeScript encontrados pelo `npm run typecheck` no Linux após a consolidação V101.1.0.

## Correções

1. `src/app/overlay-manager.ts`
   - O cleanup retornado por `registerOverlay()` agora retorna `void` em vez do boolean retornado por `Map.delete()`.
   - Corrige os erros `EffectCallback` em:
     - `src/app/use-overlay-dialog.ts`
     - `src/components/ui/modal.tsx`
     - `src/features/leads/lead-details-drawer.tsx`

2. `src/features/agenda/agenda-page.tsx`
   - O alvo da ligação é resolvido com `snapshot?.contacts ?? []` e armazenado em `callTarget`.
   - Remove os dois acessos inseguros a `snapshot.contacts` quando `snapshot` pode ser `null`.

3. `src/features/modules/module-placeholder.tsx`
   - O mapa de placeholders deixou de exigir um `Record` exaustivo das novas rotas já implementadas.
   - Usa `satisfies Partial<Record<AppRoute, string[]>>`, mantendo verificação de tipo sem exigir `commercial-map`, `communications` e `proposals`.

4. `src/features/proposals/buyer-room-modal.tsx`
   - `confirmAction` e `notify` agora vêm de `useAppUi()`.
   - `useAppActions()` fica responsável apenas pelas ações de domínio da Buyer Room.

## Escopo

- Mantém a versão lógica `101.1.0` para não criar uma nova release funcional.
- Mantém porta `4186` e todos os contratos/runtime da V101.1.0.
- Nenhuma funcionalidade de negócio foi alterada.
