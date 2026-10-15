# RealTalent CRM V101.4.0 — Calling Production Ready

A V101.4.0 endurece o fluxo de ligação criado nas versões V101.2/V101.3. O foco desta release é confiabilidade operacional: uma tentativa de chamada passa a ter identidade própria, estado recuperável, transporte observável e salvamento protegido contra duplicidade.

## O que mudou

- **Call Runtime Journal V101.4:** cada tentativa recebe `attemptId` e mantém lead, contato, provider, dispositivo, estado, timestamps e chamada externa associados.
- **Idempotência no Connect:** o `attemptId` é enviado como `requestId`; repetir a mesma requisição devolve a chamada já criada em vez de discar novamente.
- **Persistência do RealTalent Connect:** chamadas, comandos do RealTalent Phone e chaves de request são gravados localmente e restaurados depois de reiniciar o bridge.
- **Monitoramento resiliente:** falhas temporárias de polling passam a ser tratadas como transporte degradado sem transformar a chamada em falha imediatamente. Quando o bridge volta, o CRM sinaliza recuperação e retoma o estado.
- **Reconexão manual:** quando necessário, o operador pode solicitar nova sondagem do Connect sem descartar a sessão.
- **Fallback explícito:** se o Connect estiver indisponível, a chamada pode ser aberta no discador do dispositivo preservando lead, estratégia, roteiro e wrap-up.
- **Wrap-up assistido:** recomendação de encerramento e checklist contextual ao resultado da chamada.
- **Proteção de salvamento:** duplo clique/retentativa não cria atividade duplicada; o CRM também reconhece idempotência devolvida pelo repositório.
- **Pareamento do RealTalent Phone:** o código expira e é renovado automaticamente, sem necessidade de reiniciar o servidor apenas para gerar novo código.

## Limites deliberados

O RealTalent Phone continua sendo um companion web para o discador nativo. Navegadores móveis não controlam integralmente uma chamada SIM; por isso os estados `connected`, `failed` e `ended` dependem da confirmação no companion. Para telefonia PSTN totalmente controlada pelo CRM, o Agent Bridge continua sendo o caminho previsto.

## QA da release

A release inclui `qa:v101.4.0` e `runtime:connect`, com smoke dedicado para idempotência, persistência, restart do bridge, retomada de estado e finalização da chamada. O launcher Linux executa esses gates juntamente com os contratos históricos, typecheck, testes e build quando as dependências estão instaladas.
