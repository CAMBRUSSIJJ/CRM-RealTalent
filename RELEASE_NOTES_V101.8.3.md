# RealTalent CRM V101.8.3 — Connect One-Tap para iPhone

## Objetivo
Reduzir o fluxo no iPhone ao mínimo possível sem app nativo e sem VoIP pago: `CRM → enviar chamada → RealTalent Phone tenta abrir o discador → confirmação final do iOS`.

## Entregas
- RealTalent Phone separado em HTML próprio para manutenção e evolução do companion.
- One-Tap ativo por padrão no companion, persistido no navegador.
- Detecção de iPhone/iPad e modo standalone/Tela de Início.
- Manifest próprio do RealTalent Phone e ícones locais 180/512 px.
- Pareamento continua persistido; não exige novo QR a cada sessão.
- Heartbeat explícito a cada 10s com visibilidade, plataforma, modo standalone e estado One-Tap.
- Presença do celular tolera suspensão curta do navegador por até 90s.
- O CRM passa a enxergar `realtime`, `visibility`, `oneTapEnabled`, `oneTapReady` e `platformKind`.
- Diagnóstico informa quantos aparelhos estão realmente prontos para One-Tap.
- Fast Dial no iPhone tenta `tel:` imediatamente ao receber o comando, sem o atraso artificial anterior.
- Idempotência do auto-dial persistida por `callId`, evitando reabertura repetida do mesmo contato.
- Se a tela estiver oculta ou o navegador bloquear a navegação, aparece um único botão `Ligar agora` como fallback.
- Ao retornar da chamada, o Phone mostra apenas orientação para registrar resultado e seguir a Power Queue.
- Configuração do CRM destaca `One-Tap pronto`, `Tela de Início` e `tempo real` por aparelho.
- Chamada de teste da configuração agora é enviada com `fastDial=true`.
- Preparação da sessão renomeia o fluxo para `One-Tap via RealTalent Connect`.

## Limites intencionais
- O iOS continua controlando a confirmação final da chamada celular. Esta release não tenta contornar essa proteção.
- Um site/PWA local não recebe os mesmos privilégios de background de um app nativo. Para maior confiabilidade, o RealTalent Phone deve permanecer visível durante uma sessão de chamadas.
- Se o Safari/iOS bloquear a abertura automática de `tel:`, o fallback exige um toque no botão `Ligar agora` e depois a confirmação do iOS.
- Não adiciona VoIP, SIP/PSTN novo, gravação ou transcrição.

## Teste físico recomendado
1. Parear o iPhone uma vez.
2. Abrir o RealTalent Phone e manter One-Tap ativado.
3. Preferencialmente adicionar à Tela de Início.
4. No CRM, selecionar o iPhone como dispositivo padrão.
5. Enviar uma chamada de teste.
6. Confirmar se o iPhone abre a confirmação de chamada diretamente; se não abrir, validar o fallback único.
7. Iniciar uma Power Queue e testar `Salvar e próximo`.
