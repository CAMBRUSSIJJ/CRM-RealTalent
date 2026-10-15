# RealTalent CRM V101.8.3-H1 — Contact Identity Sync

Este hotfix fecha a divergência estrutural entre o registro comercial `Lead` usado em **Contatos** e a pessoa estruturada `ContactRecord` usada em **Account 360 / organograma**, sem adicionar módulos ou alterar o RealTalent Connect.

## Regra de ownership

Quando um `Lead` possui `primaryContactId`, o `ContactRecord` correspondente passa a ser a referência estruturada da identidade da pessoa. Os campos espelhados são:

- nome;
- telefone;
- e-mail;
- cargo;
- papel decisório;
- nível de influência;
- consentimento;
- bloqueio de contato e motivo.

Campos comerciais continuam exclusivos do `Lead`: empresa comercial exibida, etapa, status, temperatura, prioridade, responsável, valor, próxima ação, previsão de fechamento, notas comerciais e tags.

## Sincronização

- edição no `Lead` propaga somente os campos de identidade alterados para o contato primário;
- edição no `ContactRecord` propaga identidade somente para os leads em que aquela pessoa é `primaryContactId`;
- stakeholders secundários não são modificados;
- bulk update e merge preservam a mesma regra;
- e-mails são normalizados em minúsculas;
- o modo Supabase recebeu a mesma paridade cliente + triggers de banco com proteção contra recursão.

## Migração de bases existentes

A migration `202610010001_v101_8_3_hotfix1_contact_identity_sync.sql` reconcilia divergências antigas. Campos estruturados já preenchidos são preservados; campos vazios/`unknown` podem ser enriquecidos pelo registro comercial antes de o `ContactRecord` assumir como referência canônica. Para `doNotContact`, a reconciliação é conservadora: se qualquer lado estiver bloqueado, o bloqueio é preservado.

## QA

O hotfix adiciona testes para:

1. reparo de base legada divergente;
2. `Lead → ContactRecord`;
3. `ContactRecord → Lead`;
4. isolamento de campos comerciais;
5. persistência após reinicialização.

O RealTalent Connect permanece na implementação V101.8.3 One-Tap para iPhone.
