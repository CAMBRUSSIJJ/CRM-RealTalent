# RealTalent CRM — Configurações S3.3.1: Editor Inteligente do Pipeline

Data: 29/10/2026
PR #23
Branch: feat/realtalent-settings-s331-pipeline-editor-20261029
Base: feat/realtalent-settings-s33-smart-forms-20261029 (PR #22)

## Mudanças visíveis
- A tela de etapas mudou de formulário contínuo para linhas compactas com cor, nome,
  probabilidade, situação e contagem de leads/oportunidades vinculados.
- Clique na etapa para abrir edição contextual de nome, cor, probabilidade e
  situação. Botão para avançado permite abrir o editor já existente de critérios
  e regras por etapa, somente sem alterações locais pendentes.
- Reordenação por arrastar e soltar com mouse e alternativa por setas.
- Um botão **Salvar alterações nas etapas** confirma todas as edições e a ordem.
- Criar etapa virou opção discreta **+ Adicionar etapa**, que abre um formulário
  pequeno somente durante a criação.
- Modelos Prospecção, Venda consultiva, Pós-venda propõem adicionar apenas as
  etapas cujos nomes não existem; as etapas e oportunidades existentes ficam
  intactas. A prévia e o aviso de confirmação antecedem a execução.
- Motivos de perda, Etiquetas padrão e Tipos de atividade são listas editáveis
  individualmente; controles para adicionar, renomear, remover e reordenar.
  Essa parte permanece no rascunho de Configurações até clicar em **Aplicar
  alterações** no rodapé global da página.

## Integridade e segurança
- A implementação local e Supabase passam a aceitar o campo `order` na ação
  nativa `updateStage`, sem recaracterizar leads por mudanças cosméticas.
- Para a ordenação, o cliente salva em duas fases com posições temporárias
  que não colidem com a sequência atual, e tenta restaurar a ordem original
  em caso de falha. **A operação de múltiplas etapas não é transação
  atômica**: se a conexão falhar durante uma gravação, será necessário
  conferir o resultado após recarregar.
- A interface indica contagens de leads/oportunidades e automações vinculadas.
  Excluir etapa vinculada é bloqueado antes de chamar o backend; o backend
  revalida o vínculo. A etapa de ganho final também é protegida.
- Para etapas com vínculos, o usuário pode escolher uma etapa de destino e
  confirmar o movimento dos leads. A migração usa a ação nativa
  `bulkMoveLeads` e pode acionar automações existentes. Se houver
  oportunidades sem lead correspondente ou dependências de automações, a
  migração automática fica bloqueada.
- **Não há exclusão automática após migrar.** O usuário precisa confirmar
  a exclusão em uma ação separada, após verificar os vínculos.
- Alterar etapa de Aberta para Ganha/Perdida com negócios associados exige
  confirmação explícita; os efeitos dependem do mecanismo nativo de Pipeline.
- Presets são aditivos e não alteram nem migram oportunidades existentes.
- Não introduz nenhuma nova permissão de acesso.

## Riscos conhecidos e aceite necessário
- A PR não publica uma migração SQL nem define uma operação atômica única
  para reordenar todas as etapas. O mecanismo com duas fases e compensação
  precisa ser testado com a infraestrutura Supabase real, especialmente
  regras de unicidade e falhas de rede.
- A migração de oportunidades via leads depende da consistência de vínculo;
  casos órfãos exigem revisão no Pipeline.
- A gravação do formulário avançado de critérios usa o mecanismo original do
  StageModal e deve ser testada separadamente.
- Não houve teste gráfico direto no Firefox do computador do usuário.
- **Não promover para produção antes do aceite.**

## Cenários de QA
1. Abra Configurações > Pipeline e comercial, e vá à seção Etapas.
2. Verifique se as linhas compactas não cortam textos a 1280×720 e 125% zoom.
3. Arraste a etapa e clique em Salvar alterações nas etapas; recarregue.
4. Teste setas de mover e validação de probabilidade e nomes duplicados.
5. Edite uma situação com oportunidades para verificar confirmação explícita.
6. Tente excluir uma etapa com leads: deve mostrar contagem e proposta de migração.
7. Execute a migração somente com dados de teste; confirme que a origem
   permanece até exclusão posterior, e que as automações acionadas são auditadas.
8. Tente excluir a última etapa de ganho: deve recusar.
9. Abra modelos e veja se somente etapas ausentes serão adicionadas.
10. Edite Motivos/Etiquetas/Atividades; descarte antes de salvar, então
    repita e confirme a persistência após atualizar a página.
11. Teste modo local e Supabase, sobretudo a eventual falha de conexão
    durante reordenação; confira estado após refresh.
12. Compare o Pipeline real após edição, inclusive histórico e etapas de
    oportunidades.

## Linux
A branch é independente; porta web 4197 (fechar processo anterior).
Script: scripts/garimpo-g1g2-linux/abrir-com-diagnostico.sh
