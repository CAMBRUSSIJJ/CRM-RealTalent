# RealTalent CRM — R1 Fluxo Comercial Inteligente (primeira entrega)

## Objetivo
Reduzir o esforço entre prospecção, qualificação e trabalho comercial efetivo,
sem criar um segundo Agent, aprovar registros automaticamente ou simular ações.

## Fluxo operacional no CRM
1. O usuário abre **Garimpo** e utiliza o **RealTalent Agent principal** (botão "Conversar") para iniciar uma busca real. A G3 interpreta a intenção e o executor territorial inicia um job verificável.
2. Cada resultado bruto precisa passar pelos critérios atuais de Revisão. A interface R1 resume pendências, elegíveis, bloqueados e enviados.
3. A seleção de empresas **aprovadas e elegíveis** abre o modal já existente de envio ao CRM. A opção de criar oportunidade no Pipeline continua explícita.
4. Após confirmar, o sistema usa exclusivamente as ações nativas create/update Company, Contact, Lead e Activity. A operação retorna um recibo por empresa: processada, ignorada ou falha.
5. Os atalhos para **Contato** e **Pipeline** usam o leadId devolvido pelo CRM, e o Mapa de Contas é oferecido quando não há oportunidade vinculada.
6. O histórico canônico de prospecção registra um resumo do lote. IDs de retorno são associados ao registro do Garimpo no campo rawData, como já existia.

## Garantias
- Não cria empresas a partir de respostas de linguagem.
- A IA não aprova, descarta ou envia registros automaticamente.
- A seleção é revalidada no momento da gravação, para impedir envio de registro cuja aprovação/qualidade mudou.
- Registros já vinculados por CRM ID ou tag de origem não geram uma segunda oportunidade por acidente; o modo 'atualizar' reutiliza o vínculo.
- A tela não trata falhas, duplicatas e atividades pendentes como sucessos de um lote.
- O recibo descreve resposta de operações nativas, **não** garante leitura posterior da base.
- Permissões e governança de acesso continuam sob os controles existentes.
- Sem deploy em Production nem alteração da V6.4, nesta etapa.

## Limites conscientemente preservados
- O recibo detalhado fica aberto após a operação e não é uma auditoria durável independente; o histórico resumido e os IDs associados ao registro continuam no armazenamento existente.
- CompanyRecord sem oportunidade não necessariamente aparece na lista de Contatos; o usuário pode abrir Mapa de Contas.
- A execução fim a fim depende de validação no Firefox com Ollama, motor territorial e conexão real do CRM.
- Esta R1 não cria automações recorrentes ou cadências de contato sem consentimento.

## Verificações
- R1: testes de elegibilidade, contagem por estado, vinculação real de IDs, falha parcial e tratamento de duplicatas.
- Bridge: teste de pedido de transferência do Agent principal para Revisão, sem gravação automática.
- Regressão: G1/G2/G3, TypeScript, gateway, inicializador e build.

## Instalação de teste
Branch: feat/realtalent-r1-fluxo-comercial-inteligente-20261029
No Linux, usar scripts/garimpo-g1g2-linux/abrir-com-diagnostico.sh (porta web 4197).
Nenhum merge automático até aceite da UX e da persistência no ambiente real.

## Próximas etapas possíveis
- Comprovante de execução com readback por ID e registro de auditoria persistente no servidor.
- Fila de reprocessamento seguro para falhas parciais.
- Priorização comercial e follow-up automático somente após configuração explícita de regras.
- Auditoria visual de todo o Design System CRM em telas menores e Firefox.
