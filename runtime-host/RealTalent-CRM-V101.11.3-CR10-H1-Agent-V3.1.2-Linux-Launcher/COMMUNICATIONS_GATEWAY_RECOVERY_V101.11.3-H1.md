# V101.11.3-H1 — Communications Gateway Recovery

## Fluxo de inicialização

```text
porta 3002
   ↓
probe com token atual
   ├─ Gateway correto e saudável → reutiliza
   └─ indisponível / token diferente
          ↓
      inventário de processos
          ↓
      processo RealTalent desta release?
          ├─ sim → encerra com segurança
          └─ não
               ↓
      release RealTalent é dona comprovada da porta 3002?
          ├─ sim → encerra supervisor + gateway daquela release
          └─ não → preserva processo
          ↓
      porta livre?
          ├─ sim → inicia supervisor atual
          └─ não → modo degradado + diagnóstico
```

## Política de segurança

O runtime não usa `pkill` indiscriminado. A recuperação cruza nome do processo, diretório de trabalho e ownership da porta. Um listener desconhecido nunca é encerrado automaticamente.

## Fail-soft

Communications deixou de ser requisito para abrir o restante do CRM. Se o Gateway não subir, o terminal informa porta/PID/log e a UI continua disponível. A área de Comunicações permanece temporariamente indisponível até o serviço ser recuperado.

## Dependências QR

`qrcode` e `whatsapp-web.js` são carregados sob demanda na camada WhatsApp QR. Isso desacopla o health do Gateway do motor QR.
