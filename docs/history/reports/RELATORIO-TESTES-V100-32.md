# Relatório de testes — RealTalent CRM V100.32

## Resultado

Aprovado na validação funcional do pacote standalone, com 19 fluxos gerais aprovados e verificações específicas do mapa em desktop e celular.

## Fluxos verificados

- abertura e onboarding do CRM;
- acesso à aba independente Mapa Comercial;
- renderização responsiva em desktop e celular;
- alternância entre Marcadores, Mapa de calor e Visão mista;
- troca da métrica do mapa de calor;
- aplicação e limpeza do raio comercial a partir do lead selecionado;
- ativação da camada de prospects do Garimpo;
- filtros comerciais;
- seleção da área visível;
- seleção em massa e barra operacional;
- painel de Regiões;
- painel de prospects do Garimpo;
- painel de detalhes do lead;
- fallback local quando a biblioteca externa do mapa não carrega;
- ausência de erros de página durante os fluxos executados.

## Validação estrutural

- JavaScript do runtime validado com `node --check`;
- arquivos de versão, health check e scripts de release atualizados para V100.32;
- HTML standalone contém os assets e o runtime do mapa incorporados;
- pacote não exige conexão externa para abrir e navegar pelo CRM.

## Limitação do ambiente de validação

A recompilação completa por `npm ci` não foi concluída no ambiente de entrega. Por isso, a V100.32 foi aplicada sobre o bundle compilado validado da V100.31, com fonte de manutenção atualizada, runtime incorporado e teste funcional direto no Chromium.
