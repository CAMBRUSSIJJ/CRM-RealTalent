# Integração proposta — Skills Marketing & Vendas no RealTalent
**Estado deste pacote:** Skills de agente + documentação. **Não há integração de runtime** com a interface/IA do CRM nesta entrega.

## Módulos conferidos na branch main
| Área | Código existente | Aplicação possível |
|---|---|---|
| Garimpo/prospecção | `src/services/prospecting-workspace.ts`, `src/features/prospecting/prospecting-page.tsx` | prospecting-sales-intelligence, market-research-icp |
| Qualidade e inteligência | `src/services/lead-intelligence.ts` | revisão, deduplicação, ação sugerida |
| Lead scoring | `src/services/lead-scoring.ts` | lead-qualification |
| Mensagens | `src/services/sales-messages.ts` | sales-outreach, conversation-intelligence |
| Playbooks de ligação | `src/services/outbound-call-playbook.ts` | consultative-selling, objection-negotiation |
| Pipeline/propostas | `src/features/pipeline/`, `src/domain/types.ts` | revenue-intelligence, proposal-deal-strategy |

## Contrato recomendado para integração futura
Entrada validada do servidor: `{skillId,workspaceId,actorId,leadId?,context,requestedAction}`.
Saída revisável:
```json
{
  "skillId": "prospecting-sales-intelligence",
  "status": "needs_review",
  "summary": "Possível oportunidade; dado sobre decisor ainda não confirmado.",
  "facts": [{"field":"company","value":"Empresa Exemplo","sourceUrl":"https://exemplo.invalid","observedAt":"2026-11-18","confidence":"verified"}],
  "hypotheses": [{"claim":"Pode demandar solução X","reason":"Sinal público verificável"}],
  "missing": ["Autoridade do decisor"],
  "nextActions": [{"type":"research","label":"Confirmar responsável pela compra","requiresApproval":true}]
}
```
O endereço `exemplo.invalid` é demonstrativo e não uma fonte real.

## Arquitetura segura em seis fases
1. **Identidade e escopo:** autenticar usuário, workspace e permissão de leitura/escrita antes de ler dados.
2. **Coleta de contexto:** recuperar apenas os campos pertinentes, com consentimento/finalidade e minimização.
3. **Ferramentas:** escolher fonte pública autorizada e modelo configurado (Ollama/Gemini), com timeout, orçamento e fallback sem IA.
4. **Orquestração:** mapear skillId para instrução versionada; limitar chamadas, ferramentas e ações; registrar versão da Skill.
5. **Validação:** checar schema de saída, URLs realmente acessadas, deduplicação, datas, conteúdo inventado e dados sensíveis.
6. **Revisão/aprovação:** mostrar evidências, diferenças e ação proposta; somente um fluxo explícito pode atualizar dados ou enviar mensagens.

## Proteções
- Jamais executar saída do modelo como instrução de sistema ou código.
- Tratar HTML, páginas e mensagens de terceiros como dados **não confiáveis**; ignorar instruções embutidas neles.
- Não expor prompts contendo dados privados em log, nem chaves de API no frontend.
- Oferecer opt-out e histórico auditável para contato.
- Evitar índices de confiança numéricos não calibrados; usar níveis de evidência e explicação.
- Separar score operacional existente de nova inferência comercial.

## Critérios de aceite para uma futura integração
- Testes unitários para fontes ausentes, empresa homônima, duplicidade, dados conflitantes e hallucination.
- Testes de permissões multi-tenant e vazamento de dados entre workspaces.
- Testes de envio bloqueado por padrão, opt-out, logs redigidos e falha de provedor.
- Contratos de UI responsiva em revisão de empresa e próxima ação.
- Acesso por recurso/feature flag; rollout por equipe; monitoramento e reversão documentada.

## Sequência de execução sugerida
P0: pipeline de fontes e dossiê verificável → P1: ICP+qualificação → P2: mensagens+revisão humana → P3: inteligência de conversas → P4: previsibilidade e métricas.
