# RealTalent CRM V101.10.6-H2 — Global Selection & Ownership Fix

## Entregue

- rollout global do Selection System nas features: caixas nativas foram migradas para `NativeSelectionSelect`, mantendo `value`, `onChange`, `disabled` e opções existentes;
- `OwnerPicker` canônico com busca, iniciais, função e e-mail;
- criação de membros locais em **Configurações → Equipe e permissões**, sem login obrigatório;
- troca real de responsável no cadastro de contato e na ficha/drawer;
- responsável do Garimpo continua alimentado pelo mesmo diretório de membros;
- selects-chave do Lead Form e Lead Drawer migrados diretamente para componentes ricos;
- repository parity ampliada para 99 métodos Local/Supabase;
- sem migration SQL nova; armazenamento local reutiliza a coleção `members` existente.

## Regra de design

`src/features` não deve introduzir `<select>` nativo. Compatibilidade legada passa por `NativeSelectionSelect`; novos fluxos devem preferir `SelectionSelect`, `OwnerPicker`, `EntityPicker`, `MultiSelection` ou `FilterSelection` conforme o caso.
