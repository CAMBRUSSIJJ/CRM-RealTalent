# RealTalent Meet — M2/M3 (2026-10-30)

## O que mudou
- Reuniões: iniciar agora, agendar, abas Próximas/Histórico, busca, menu contextual; respeita a navegação do CRM.
- Pré-entrada: preview de câmera, microfone e seleção de dispositivos.
- Sala: vídeo WebRTC, chat, compartilhamento de tela, indicador de duração, painel de contexto comercial e notas privadas. Notas confirmadas entram no histórico do contato como atividade.
- Encerramento: decisões e follow-up podem ser registrados no CRM; o anfitrião encerra apenas após atualização autorizada no banco.
- Conexão: negociação de ofertas determinística, ICE restart após desconexão, verificações de estado da sala dos convidados.
- TURN: Edge Function 'meet-turn-credentials' fornece credenciais HMAC temporárias se houver coturn configurado; caso contrário, somente STUN, com limitação conhecida em redes restritas.

## Configuração opcional TURN (produção requer provedor)
Configurar no Supabase Edge Functions → Secrets:
- `MEET_TURN_URLS`: uma ou mais URLs separadas por vírgulas, ex.: `turn:relay.example.org:3478?transport=udp,turns:relay.example.org:5349?transport=tcp`
- `MEET_TURN_SHARED_SECRET`: segredo usado no servidor coturn com `use-auth-secret`, armazenado apenas no Supabase.

A função `meet-turn-credentials` exige um convite válido e ativo, expira as credenciais após uma hora e não retorna segredos de infraestrutura. **Não use credenciais fixas TURN em variáveis VITE_ ou no frontend.**
No estado atual o relay fica indisponível até configurar servidor e segredos; o STUN sozinho não garante chamadas em todas as redes.

## Limites / segurança
- As validações de segurança e persistência da sala permanecem sob RLS e callback de status do anfitrião.
- O sinal de encerramento recebido do navegador **não** encerra a reunião por si só: o cliente confere o estado autorizado no banco.
- Convites são links-portador: quem conhece a URL pode entrar no chat/vídeo. Sala de espera moderada e controle de capacidade no backend **não estão implementados**, apesar dos campos existentes.
- Esta versão é P2P e não substitui infraestrutura SFU para reuniões grandes.
- Rascunhos de notas são locais ao navegador; somente o botão 'Salvar no histórico do CRM' os compartilha com o workspace.

## QA necessária antes de Production
- [ ] Validar permissões de acesso e RLS com papéis owner, member, viewer e convidado.
- [ ] Criar reunião e observar o vínculo na Agenda e no histórico do contato.
- [ ] Testar convidado anônimo em Firefox e Chrome, computadores e redes diferentes.
- [ ] Conferir compartilhamento/retorno de câmera; desativar e reativar dispositivos.
- [ ] Confirmar interrupção de rede e recuperação de ICE; testá-la novamente após configurar TURN.
- [ ] Testar credenciais de TURN no servidor e sua expiração; inspecionar logs de abuse/rate limit.
- [ ] Verificar que convidados não conseguem encerrar reunião por sinal falso.
- [ ] Regressão de WhatsApp, e-mail, Garimpo, Configurações e login.
- [ ] Revisar dependências: npm audit ainda aponta 7 avisos (4 altos).

A PR deve permanecer em draft até os testes de chamada real e segurança estarem concluídos.
