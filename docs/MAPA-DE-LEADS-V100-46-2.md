# Mapa de Leads — V100.46.2

## Funções

- localização de cada lead por coordenadas salvas;
- marcadores por etapa ou prioridade;
- agrupamento de marcadores próximos;
- mapa de calor por quantidade, pipeline ou atraso;
- filtros comerciais e busca textual;
- raio a partir de um lead;
- seleção de área e ações em massa;
- fila de endereços pendentes;
- correção manual da posição;
- ligação, WhatsApp, rota e acesso ao cadastro;
- integração de contexto com Leads, Ligações e Garimpo.

## Modos

**Conectado:** Google Geocoding processa o endereço no backend e salva as coordenadas no Supabase.

**Demonstração:** o CRM utiliza uma estimativa determinística por cidade. A interface identifica a posição como aproximada e nunca afirma que a API está conectada.

## Segurança

- a chave do Google permanece em Edge Functions;
- RLS isola configurações, fila e histórico por organização;
- perfis viewer podem consultar, mas não alterar;
- alterações manuais geram histórico;
- trabalhos possuem lease, retry e limite de tentativas.
