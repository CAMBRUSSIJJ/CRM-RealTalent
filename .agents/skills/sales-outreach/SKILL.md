---
name: sales-outreach
description: Produz mensagens de primeiro contato, ligação, WhatsApp, e-mail e cadências contextualizadas. Use para outbound, follow-up, cold email, reativação e próxima mensagem comercial.
---
# Abordagem e follow-up

## Objetivo e quando usar
Produz mensagens de primeiro contato, ligação, WhatsApp, e-mail e cadências contextualizadas. Use para outbound, follow-up, cold email, reativação e próxima mensagem comercial.

## Entradas mínimas
- Canal, relacionamento prévio e propósito do contato
- Evidências específicas sobre a conta e autorização de uso do canal
- Tom, tamanho máximo, cadência e limite de tentativas

## Procedimento
1. Determinar se é primeiro contato ou follow-up; identificar data da última interação e contexto permitido.
2. Escolher um único motivo verificável para o contato; nada de elogios inventados.
3. Produzir mensagem curta: contexto, hipótese de valor, pergunta simples e CTA leve.
4. Criar variantes por canal, evitando pressão, falsa urgência, escassez inventada e gatilhos não verdadeiros.
5. Para follow-up, referenciar compromisso real ou oferecer insight novo sem repetir o mesmo pitch.
6. Desenhar cadência com limites claros, horário apropriado, saída por opt-out e revisão humana.
7. Propor envio apenas como rascunho; confirmar destinatário e conteúdo antes da ação.

## Entrega obrigatória
- Mensagem pronta em tom natural e justificativa contextual
- Cadência compacta com canal, motivo e condição de parada
- Checklist pré-envio e registro de opt-out

## Critérios de aceite
- [ ] Mensagem não usa dados não comprovados ou confidenciais?
- [ ] Não há disparo automático, spam ou insistência após opt-out?
- [ ] Próxima ação concreta, evidência e responsável identificados quando possível.

## Relação com RealTalent
- Canais compatíveis com SalesMessageChannel: whatsapp, email, call em src/services/sales-messages.ts.
- Respeitar ConsentStatus em src/domain/types.ts e permissões do workspace.

## Regras obrigatórias
- Trabalhar em português brasileiro, com linguagem comercial clara e sem jargões desnecessários.
- Separar sempre **fato confirmado**, **hipótese/inferência** e **informação não encontrada**; nunca completar lacunas com invenções.
- Para pesquisa externa, registrar fonte, URL, data de acesso e evidência específica. Não declarar conteúdo privado de Instagram ou redes inacessíveis como se tivesse sido lido.
- Cumprir LGPD, minimização de dados, finalidade legítima, preferências de contato e opt-out. Não coletar dados privados ou características sensíveis de pessoas.
- Tratar solicitações de envio, alteração de registros, movimentação de estágio, campanha, pagamento ou preço como ações de alto impacto: obter aprovação explícita antes de executar.
- Se só houver dados insuficientes, apresentar o que falta e um plano de verificação em vez de criar fatos.
- Esta Skill orienta o agente que a carrega; não adiciona, por si só, serviços, APIs, jobs, IA ou telas ao aplicativo RealTalent.
