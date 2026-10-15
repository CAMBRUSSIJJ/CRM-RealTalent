# V101.2.0 — Calling Workflow & Strategy

Esta release evolui o Calling sem voltar a poluir o Modo Foco. O fluxo passa a separar claramente **estratégia, preparação, conversa e registro**.

## Strategy Hub

- nova visão **Estratégia** dentro de Playbooks;
- objetivo comercial padrão e modo Focus/Power por workspace;
- seleção automática de roteiro conforme contexto ou roteiro padrão manual;
- controle de Assistant, histórico sob demanda, autosave de notas e Call Health apenas por exceção;
- atalho direto da preparação de ligações para o Strategy Hub.

## Preparar ligações

- “Playbook da sessão” passa a ser apresentado ao vendedor como **Roteiro da sessão**;
- seletor visual para trocar o roteiro apenas naquela sessão;
- explicação curta do motivo da seleção automática;
- validações em zero deixam de ocupar espaço: quando não há problema, aparece apenas **Fila pronta para ligar**;
- Call Health e próximo da fila só aparecem quando agregam informação;
- indicadores de sessão irrelevantes são ocultados em filas pequenas.

## Modo Foco

- mantém o roteiro como centro da tela;
- adiciona **Contexto, Histórico e Anotações** em disclosure progressivo;
- resumo mostra empresa, contato, oportunidade, última interação e informações fixadas;
- histórico reúne chamadas, atividades e agenda do lead;
- notas possuem rascunho local por lead e autosave opcional;
- uma nota pode ser fixada como informação importante para conversas futuras;
- Assistant pode ser escondido por configuração e o conteúdo principal ocupa toda a largura;
- Call Health saudável pode permanecer invisível, surgindo apenas quando exige atenção.

## RealTalent Phone

O RealTalent Connect agora pode parear um celular na mesma rede local sem depender da Twilio:

1. o Connect exibe um endereço e um código de pareamento;
2. o usuário abre o endereço no celular e pareia o dispositivo;
3. o celular passa a aparecer em **RealTalent Voice & Dialer → Dispositivos detectados**;
4. ao clicar em **Ligar agora**, o lead é enviado ao RealTalent Phone;
5. o companion abre o discador nativo do celular usando `tel:`;
6. ao voltar ao companion, o usuário confirma `atendeu`, `não atendeu` ou `finalizar`, e o estado retorna ao CRM.

### Limite técnico explícito

Um navegador móvel não controla automaticamente uma chamada SIM nativa. Por isso, o RealTalent Phone **não promete mute, hold, hangup ou detecção automática da operadora**. Para telefonia controlada integralmente pelo software, o **Twilio Agent Bridge** continua disponível como provider PSTN do RealTalent Connect.

## Segurança local

- Voice API continua aceitando somente as origens locais autorizadas do CRM;
- lista de dispositivos não expõe o token de pareamento;
- RealTalent Phone usa token aleatório após pareamento;
- o dispositivo pareado fica registrado localmente para não exigir novo pareamento a cada reinicialização do Connect;
- o servidor escuta `0.0.0.0` apenas para permitir o acesso do celular na LAN; o CRM continua servido em `127.0.0.1`;
- o gate de release executa um smoke real de pareamento → dispositivo → chamada → connected → ended;
- não há exposição automática para Internet.

## Linux

CRM: `http://127.0.0.1:4187`  
RealTalent Connect: porta `3001`  
RealTalent Phone: o launcher imprime a URL LAN e o código de pareamento.
