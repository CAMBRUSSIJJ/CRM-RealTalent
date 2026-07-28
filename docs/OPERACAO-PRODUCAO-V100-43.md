# Operação de produção — V100.43

Aplicar a migration `202607270004_v100_43_proposals_forecast.sql`, executar os contratos SQL e publicar o frontend gerado pelo pipeline oficial. Não alterar propostas diretamente no banco: use as RPCs de gravação, revisão e status para preservar totais, histórico e receita.
