# Instalação Linux — RealTalent CRM V101.9.2

## Universal View Engine

```bash
cd ~/Downloads 2>/dev/null || cd ~/Baixados
unzip RealTalent-CRM-V101.9.2-Universal-Record-Page-Linux-Launcher.zip
cd RealTalent-CRM-V101.9.2-Universal-Record-Page-Linux-Launcher
chmod +x start-linux.sh
./start-linux.sh
```

O launcher:

1. instala/repara dependências na primeira execução;
2. executa preflight Linux;
3. roda auditorias históricas + V101.9.0 + V101.9.1 + V101.9.2 + typecheck + Vitest + build + smokes;
4. inicia RealTalent Connect em `:3001`;
5. inicia Communications Gateway em `:3002`;
6. serve o CRM aprovado em `:4188`.

A V101.9.2 procura primeiro a V101.9.1 e depois a V101.9.0 e, como fallback, a V101.8.4-H15 (e hotfixes anteriores) para preservar a sessão de Comunicação/WhatsApp quando a pasta anterior permanece ao lado da nova instalação.

## Metadata inspector interno

Com o CRM aberto, o console do navegador pode consultar:

```js
window.__REALTALENT_METADATA__.inspect()
```

Isso não altera a UX e serve apenas para diagnóstico da fundação metadata.

## RealTalent Connect One-Tap

A funcionalidade da V101.8.3 continua preservada. Em **Ligações → Configurações → RealTalent Connect One-Tap**, mantenha o celular pareado e o RealTalent Phone aberto quando usar chamadas pelo aparelho.
