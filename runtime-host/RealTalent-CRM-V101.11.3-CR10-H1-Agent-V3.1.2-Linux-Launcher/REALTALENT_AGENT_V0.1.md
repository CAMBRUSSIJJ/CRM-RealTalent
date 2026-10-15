# RealTalent Agent V0.1 — CRM integration

- Gateway externo opcional em `http://127.0.0.1:8791`.
- O CRM envia somente contexto comercial sanitizado para planejamento.
- Tools mutáveis permitidas nesta fase: `crm.create_followup` e `crm.move_opportunity`.
- IDs propostos pela IA são revalidados contra o snapshot atual.
- A aplicação continua sendo a única autoridade de escrita e exige confirmação explícita.
- Se o Agent Runtime estiver indisponível, o Assistant local determinístico continua funcionando.
- A `OPENAI_API_KEY` fica somente no processo local `RealTalent Agent Runtime`, fora do browser e fora do bundle do CRM.
