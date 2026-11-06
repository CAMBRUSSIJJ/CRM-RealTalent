# RealTalent — Análise de Vendas Ganhas (Won Sales Analysis)

Prévia experimental construída **a partir da metodologia geral** de Craig Elias (*Trigger Event Selling*). O código é original; não reproduz a planilha ou software proprietário.

## Como usar

1. Abra **Pipeline**, marque uma oportunidade como **Ganha**. A seção **Análise de Vendas Ganhas** será apresentada após o movimento. Também é possível usar **Outros → Análise de Vendas Ganhas** para registrar eventos de vendas antigas.
2. Na lista de vendas ganhas, clique **Analisar**.
3. Informe **acontecimento**, **categoria**, **data do evento**, **por que o cliente escolheu a solução**, **fonte/evidência** e observação verificável. Alternativa anterior e data da descoberta são opcionais.
4. Salve. A análise estará vinculada ao ID da oportunidade. Não são adicionados novos contatos ou mensagens WhatsApp.
5. Em **Métricas → Vendas ganhas** consulte a frequência dos gatilhos, quantas vendas têm informação documentada e quantas são hipóteses.
6. Em **Garimpo** consulte os sinais mais observados. O botão **Investigar sinal** abre o agente com um pedido de pesquisa que exige empresas reais, datas e fontes. Resultados precisam continuar passando por revisão humana.

## Tratamento de evidências
- Relato do comprador, documento, fonte pública ou observação interna podem ser tratados como registros com evidência. **Observação interna deve ser verificada**, não é verdade confirmada.
- **Hipóteses** ficam identificadas e não contribuem para a receita documentada nem para o intervalo entre acontecimento e ganho.
- O intervalo temporal só é calculado quando a oportunidade contém `closedWonAt`. A atualização mais recente de um contato ou negócio não é usada como substituto.
- Frequências da amostra de vendas ganhas **não** são estimativas de conversão, propensão de compra, causalidade nem garantia de sucesso.
- Caso o evento ainda não tenha evidências confiáveis, registre como hipótese.

## Persistência — atenção
Esta primeira entrega é **local ao navegador**. Guarda os registros em `localStorage` com isolamento lógico por workspace, e não os sincroniza com outros computadores, Supabase nem Railway.
- Não utilize esta prévia como a única fonte de dados críticos; exporte CSV para backup.
- Como o armazenamento é do navegador, usuários que compartilham o mesmo perfil de navegador e dispositivo podem acessar os dados locais. Não inclua informações sensíveis de clientes nesta versão.
- A próxima fase deve criar tabela autenticada por workspace com RLS, trilha de auditoria e sincronização transacional. Só depois remover a ressalva de dados locais.

## QA (prévia)

```bash
npm ci --include=dev
npm exec -- vitest run src/services/won-sales-analysis.test.ts
npm run typecheck
npm run build
```

Testes obrigatórios no Linux:
1. Abrir vendas anteriores sem a análise: não pode inventar dados.
2. Registrar uma venda ganha com evento comprovado e outra como hipótese.
3. Conferir separação nos indicadores e exportação CSV.
4. Mover venda do Pipeline para etapa ganha, depois documentar sem travar movimentação.
5. Atualizar página e reabrir análise no mesmo navegador.
6. Alternar workspace e verificar isolamento lógico dos registros.
7. Garimpo deve apenas sugerir pesquisa e exigir fontes, jamais importar automaticamente oportunidades.
8. Conexão WAHA, notificações e tarefas permanecem intactas.

## O que esta versão ainda não faz
- Não entrevista automaticamente compradores.
- Não lê e extrai automaticamente eventos dos áudios WhatsApp.
- Não identifica mudanças de empresas em tempo real sem pesquisa por fontes.
- Não calcula conversão de prospects sinalizados por gatilho.
- Não atribui pontuação de compra a empresas sem validação.
- Não sincroniza registros entre dispositivos.

A prévia fica no PR #76. **Production não foi alterada**.
