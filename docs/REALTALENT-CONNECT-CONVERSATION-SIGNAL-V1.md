# RealTalent Connect → CRM — Conversation Signal v1

Schema: `realtalent.connect.conversation.v1`

Campos aceitos: workspace, lead, call, data da conversa, resumo, dores, objeções, buying signals, riscos, participantes e próximo passo sugerido. O normalizador limita tamanho/quantidade e rejeita payload sem schema, origem ou identificadores obrigatórios.

O CRM não grava áudio nem executa transcrição neste contrato. O Connect continua responsável pela captura e análise; o CRM será responsável por transformar sinais aceitos em contexto de oportunidade e ações, quando a integração for habilitada.
