# RealTalent Meet — operação e critérios de liberação

## Estado da infraestrutura (02/11/2026)

- O frontend funciona em Vercel e a sinalização usa Supabase Realtime (Broadcast + Presence).
- A função Supabase `meet-turn-credentials` existe e retorna HTTP 503 quando `MEET_TURN_SHARED_SECRET` ou `MEET_TURN_URLS` não estão configurados. Requisições 503 foram observadas.
- Sem TURN, a negociação WebRTC usa STUN e pode falhar entre NATs restritivos, em redes corporativas e redes móveis.
- Não marcar o Meet como plenamente operacional apenas porque a Vercel concluiu o build.

## Para o administrador provisionar TURN

1. Contratar ou disponibilizar um serviço TURN com UDP e alternativa TCP/TLS, em um host público. Preferir instância com portas UDP publicamente acessíveis; um proxy HTTP comum não transporta mídia WebRTC.
2. Configurar o servidor coturn para credenciais temporárias via shared secret (`use-auth-secret`), TLS válido, realm e portas de relay abertas. Não colocar o secret no código, em variável Vite ou no navegador.
3. Definir `MEET_TURN_SHARED_SECRET` e `MEET_TURN_URLS` nos secrets da função Supabase; `MEET_TURN_URLS` deve conter URIs `turn:`/`turns:` separados por vírgula, incluindo as portas. Certificar-se de que o secret é o mesmo do servidor.
4. Testar a função com um convite ativo válido; resposta esperada HTTP 200, `iceServers` com credenciais temporárias, sem expor o segredo.
5. Testar uma chamada entre dois provedores de internet distintos. Verificar `chrome://webrtc-internals` ou `about:webrtc`, procurando candidato `relay` quando necessário.
6. Conferir a aba **Rede** no Meet: TURN **Disponível** não garante que o tráfego efetivamente usou relay. O tipo de rota em chamadas conectadas indica **Conexão direta** ou **Retransmissão TURN**.

**Nota sobre Railway:** o ambiente existente não tem um serviço TURN. Railway suporta TCP proxy, mas o acesso UDP de entrada não é oferecido diretamente na configuração conhecida; avaliar esse custo e a compatibilidade antes de implantar um relay.

## Teste de aceitação (Firefox + Chrome)

- Criar reunião e cancelar preparação: não deve alterar status para `live`.
- Entrar na reunião e assinar Realtime: status passa a `live`.
- Dois navegadores, dispositivos autorizados: áudio e vídeo em ambos os sentidos.
- Entrar sem câmera e microfone; ativar ambos depois de conectar, sem recarregar.
- Negar permissão, selecionar dispositivo inválido e recuperar o dispositivo.
- Iniciar compartilhamento, trocar janela, interromper e verificar retorno da câmera.
- Chat com dois convidados: status `Recebida` após ao menos um ACK, `Falha no envio` se broadcast falhar e opção de reenviar.
- Participantes entram e saem: lista Presence acompanha conexões ativas.
- Interromper a rede e solicitar reconexão: observar negociação ICE e estado de mídia.
- Encerrar para todos: mudança persistida no banco, sinal enviado, convidados saem; registrar resumo e acompanhamento no CRM.
- Verificar a mesma chamada usando Wi-Fi e 4G/5G, Firefox desktop e Chrome em outra rede.
- Não liberar para produção com TURN indisponível, falha de áudio/vídeo entre redes ou erro de TypeScript.

## Limitações atuais

- Sala de espera moderada e admissão segura não estão implementadas. A flag `waitingRoom` não fornece controle de acesso por si só.
- Chat é efêmero: ACK de recebimento em uma sessão não substitui armazenamento durável das mensagens.
- O serviço usa topologia WebRTC mesh, adequada para grupos pequenos; reuniões numerosas exigem SFU.
