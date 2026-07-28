# RealTalent CRM V100.46.4

Release de **estabilidade operacional**, com foco na correção da aba Leads, simplificação do fluxo de Ligações e remoção da Central de Comunicações da interface.

## Entregas principais

- normalização defensiva de snapshots e registros antigos antes do render;
- proteção contra coleções nulas, datas inválidas, tags incompatíveis e campos legados;
- aba Leads preservada mesmo quando existirem cadastros incompletos no Supabase;
- fila de Ligações com indicadores compactos, filtros progressivos e largura integral;
- Modo Ligação em Foco com script central, painel lateral por abas e encerramento progressivo;
- resultado, próxima ação e salvamento exibidos somente após finalizar a chamada;
- controles de gravação e transcrição recolhíveis;
- Central de Comunicações removida da navegação, rotas, componentes e serviços de tela;
- integração de calendário da Agenda isolada em serviço próprio;
- Mapa de Leads profissional preservado;
- build independente do registro npm para publicação no Vercel;
- auditorias de renderização, arquitetura, banco, migrations, segurança e release.

## Validação portátil

```bash
node scripts/run-portable-homologation.mjs
```

## Publicação

Copie o conteúdo desta pasta para a raiz do repositório. O `vercel.json` já define o build e a pasta `dist` sem executar `npm install` no deployment.
