# V101.11.1-H1 — Login Gate & Logout

## Adicionado
- Gate explícito antes do workspace local.
- Ação `enterLocal()` separa perfil persistido de sessão atual da interface.
- Sessão local de UI em `sessionStorage`, sem transformar o modo local em autenticação por senha.
- Botão **Sair da conta** também no modo local.

## Corrigido
- O CRM local não abre mais diretamente em uma nova sessão só porque existe um perfil salvo.
- O bootstrap do workspace não roda enquanto não houver usuário/sessão de UI.
- Sair no modo local volta ao login sem apagar contatos, pipeline, preferências ou demais dados locais.

## Preservado
- Animação/logo RealTalent da V101.11.1.
- Autenticação Supabase real, recuperação de senha e confirmação de e-mail.
- Communications Architecture V101.11.0.
- 49 migrations e modelo de dados existente.
