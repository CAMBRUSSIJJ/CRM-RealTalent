# RealTalent CRM V101.10.1 — Prospecting Search Automation

## Objetivo

Automatizar a etapa de descoberta do **Garimpo** usando fontes suportadas pelo CRM, sem depender de scraping de interface ou de um navegador específico.

## Busca Automática — Google Places

Quando Google Places está configurado como fonte direta, o usuário informa:

- segmento;
- uma ou mais cidades/regiões, separadas por `;`;
- busca específica opcional;
- meta de 20, 40, 60, 80 ou 100 resultados únicos.

O RealTalent então:

1. cria um plano de consultas;
2. pesquisa a primeira região;
3. segue automaticamente o `nextPageToken` do Google Places;
4. deduplica resultados antes de contabilizar a meta;
5. avança para regiões/consultas seguintes quando necessário;
6. interrompe ao atingir a meta ou o limite seguro de consultas;
7. envia o lote coletado ao Data Layer para análise/revisão.

A deduplicação durante a coleta usa sinais fortes disponíveis, incluindo `placeId`, CNPJ, telefone, domínio e identidade empresa + cidade.

## Controle operacional

A tela do Garimpo agora apresenta:

- progresso `encontrados / meta`;
- quantidade de consultas realizadas;
- região e consulta em execução;
- cancelamento da busca;
- preservação dos resultados já coletados quando o usuário cancela entre consultas.

## Multinavegador

A busca direta acontece pelo gateway do RealTalent, e não por scraping do navegador. Portanto o fluxo funciona independentemente de Chrome, Firefox, Edge ou Brave quando o provider está configurado.

O **RT Capture Browser** e o **Capturador Universal** continuam disponíveis para fontes assistidas e captura manual por URL/clipboard/bookmarklet.

## Fontes

### Google Maps / Google Places

- Direto quando `GOOGLE_MAPS_API_KEY` está configurado.
- Paginação automática.
- Até 100 resultados únicos por execução na UI desta release.
- Fallback para busca assistida quando o provider não está disponível.

### CNPJ

- Consulta direta individual quando o provider cadastral está disponível.
- Não executa varredura automática de CNPJs.

### Instagram

- Continua em modo assistido.
- Esta release não implementa scraping automático de Instagram.

## Segurança e custo

A automação possui limite de consultas por execução. Isso reduz risco de loops e ajuda a controlar consumo do provider. Uso do Google Places pode gerar cobrança conforme a conta Google Cloud configurada pelo workspace.

## Compatibilidade

- Data Layer 2.5 preservado;
- revisão guiada preservada;
- deduplicação existente preservada;
- RT Capture preservado;
- Capturador Universal preservado;
- Settings Experience 2.0 preservado;
- nenhuma migration SQL nova;
- migrations permanecem 49/49.
