# Linux Verified — V101.2.0

A V101.2 mantém o launcher de produção da V101.1 e adiciona o RealTalent Phone na rede local.

O CRM permanece restrito a `127.0.0.1:4187`. O RealTalent Connect escuta `0.0.0.0:3001` para que o celular na mesma LAN consiga abrir o companion. Isso **não publica o serviço na Internet**; regras do firewall/roteador continuam valendo.

O launcher bloqueia abertura quando falha qualquer gate de código, TypeScript, Vitest, build, auditoria de bundle ou smoke HTTP.
