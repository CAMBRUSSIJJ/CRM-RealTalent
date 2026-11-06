# Garimpo — Trigger Intelligence G4.1 + G4.2 (prévia local)

**Escopo:** classificar acontecimentos a partir de trechos de fontes públicas associados a empresas encontradas pelo Garimpo; registrar citações e hipóteses; submeter à revisão humana. O Qwen não faz buscas fictícias e não envia empresas ao CRM.

## Como acessar

Em Linux, abra o CRM da branch \`feat/garimpo-trigger-intelligence-g4-20261106\` com o inicializador WAHA existente, vá a **Garimpo → Revisar → Guiada**, selecione uma empresa e role até **G4 · Trigger Intelligence**, após o painel de qualificação G1/G2.

A área G4:
- Pré-preenche o link HTTPS e o trecho quando a coleta G1/G2 guardou uma origem explícita com seu texto.
- Se não existe esse par, pede que o usuário abra uma fonte pública e copie o trecho; não transforma descrição genérica da empresa em evento comprovado.
- O botão **Analisar com Qwen local** envia somente empresa, cidade, segmento, link e trecho, sem telefone, e-mail, notas privadas nem CRM token, ao **Agent local em 8791**.
- O Qwen devolve até 3 candidatos com uma citação literal, classificação, uma possível necessidade explicitamente marcada como hipótese e pergunta para investigação comercial.
- Uma validação determinística descarta fatos e datas não presentes no trecho, aceita \`events: []\` sem inventar resultados e mantém a confiabilidade da fonte como **não verificada**.
- Cada candidato pode ser aprovado apenas depois que a pessoa marca que conferiu publicação, trecho e identidade da empresa, ou rejeitado com justificativa.
- A aprovação G4 **não aprova o prospect em G1/G2, não envia mensagens e não cria oportunidade no Pipeline**.
- A análise fica registrada **no navegador atual**, separada por workspace e por empresa. Isso não é isolamento de segurança entre contas com acesso ao mesmo perfil do navegador. Não use para dados sensíveis até existir RLS e auditoria no Supabase.
- Quando disponível, exibe somente a quantidade de **vendas ganhas documentadas** da mesma categoria, sem calcular probabilidade de compra.

## Componentes

| Camada | Arquivo |
|---|---|
| Classificador G4 estruturado, Qwen local | \`runtime-host/RealTalent-Agent-Runtime-V3.1.2/crm-trigger-events-g4.mjs\` |
| Endpoint de classificação | \`runtime-host/RealTalent-Agent-Runtime-V3.1.2/gateway-ollama.mjs\` — \`POST /tools/trigger-events\` |
| Coleta das evidências já disponíveis + revisão local | \`src/services/prospecting-triggers-g4.ts\` |
| Painel da revisão guiada | \`src/features/prospecting/prospecting-trigger-g4.tsx\` |
| Ativação local segura do Agent | \`scripts/garimpo-g4/ativar-agente-local.sh\` |

## Agent antigo em 8791

O instalador da prévia G4 tenta ativar o Agent na porta 8791 **somente quando a porta está livre** e Ollama com o modelo configurado está operacional. Ele nunca derruba ou substitui automaticamente um Agent antigo em execução.

Se aparecer "um Agent antigo ocupa 8791 sem o endpoint G4", encerre o serviço antigo pelo gerenciador que você usa no Linux, de forma controlada, antes de iniciar a versão atualizada. **Não desligue o Docker WAHA** para resolver esse conflito.

Verificações locais:

\`\`\`bash
curl --noproxy '*' -s -X POST -H 'Content-Type: application/json' -d '{}' \
  http://127.0.0.1:8791/tools/trigger-events
# Endpoint G4 ativo: {"ok":false,"error":"invalid_source_or_excerpt"}

ollama list
# Confirme que qwen3:8b está instalado antes de iniciar.
\`\`\`

Para iniciar manualmente, se 8791 estiver livre:

\`\`\`bash
cd ~/Downloads/RealTalent-CRM-V101-WAHA
bash scripts/garimpo-g4/ativar-agente-local.sh
\`\`\`

## Critérios de aceitação

1. Abrir empresa do Garimpo que tenha fonte e trecho vinculados; confirmar ambos no editor.
2. Analisar notícia de expansão que mencione explicitamente abertura de filial: o candidato deve citar o trecho sem fabricar uma data.
3. Analisar texto promocional genérico: não deve criar evento-gatilho.
4. Analisar notícia de empresa diferente: revisor deve rejeitar com justificativa.
5. Marcar "conferi" somente após checar URL, data e identidade; aprovação G4 não muda status de transferência da empresa.
6. Trocar workspace e empresa; histórico G4 não deve aparecer cruzado.
7. Desligar Ollama: a análise deve falhar claramente, sem gerar hipótese falsa.
8. Confirmar ausência de alterações em tarefas, WAHA, notificações, Pipeline e Supabase.
9. Testar em Firefox e em 1280×720; revisar longas URLs e trechos.

## Limitações intencionais

**G4.1/G4.2 não criam um robô de coleta recorrente de notícias.** A versão analisa fontes já reunidas pelo Garimpo ou explicitamente fornecidas pelo revisor; a ampliação de conectores de fontes e monitoramento periódico precisa de um projeto separado com termos de uso e LGPD avaliados.

**G4.3** será a persistência Supabase, trilha de auditoria, políticas RLS, histórico de revisão e integração de sinais aprovados ao Pipeline. Não habilitar esta etapa sem validar segurança, precisão e falsos positivos.

**Não há taxa de conversão, propensão de compra ou garantia de interesse.** A interface não mostra um score comercial automático a partir do tamanho de uma citação; somente a evidência e seu estado de conferência. Futuro índice de priorização dependerá de ICP, atualidade e validação da fonte.
