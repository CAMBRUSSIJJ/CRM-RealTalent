# Relatório de testes — RealTalent CRM V100.36

## Resultado

Aprovado para entrega técnica.

## Verificações concluídas

- 128 arquivos TypeScript/TSX/Edge Functions analisados sem erro sintático;
- 126 arquivos de release auditados;
- 22 verificações de pré-produção aprovadas;
- 4 fluxos específicos de Automação Profissional aprovados no Chromium;
- 5 fluxos de regressão de Meu Dia, Leads, Lead Score e Configurações aprovados;
- desktop 1440 px e celular 390 px sem overflow global;
- nenhum erro de console ou de página nos testes executados.

## Fluxos da V100.36

- Templates preservados e proteção anti-loop exibida;
- cadastro de webhook e teste local seguro;
- pausa, ativação e novas tentativas sem duplicar endpoint;
- histórico de entregas e funcionamento responsivo;
- segredo excluído das consultas do navegador no modo Supabase;
- idempotência por organização, endpoint, correlação e evento;
- claim de entrega para impedir dois workers enviando a mesma requisição;
- recuperação de entregas interrompidas;
- bloqueio de HTTP, localhost e redes privadas na Edge Function;
- validação do usuário e da organização antes do despacho manual.

## Observação de compilação

O registro de dependências retornou indisponibilidade externa durante `npm ci`. Por isso, o código-fonte foi validado por análise sintática e auditorias, e o HTML executável foi validado diretamente no Chromium. Uma recompilação normal poderá ser executada quando o registro estiver disponível.
