# Garimpo G8 — investigação, revisão e persistência

O G8 mantém o Firecrawl, o Ollama e o conector atual. Acrescenta contrato de resultado `garimpo-research/8`, diagnóstico de execução dos provedores, pesquisa adaptativa limitada e recomendações baseadas nos fatos coletados. O SDK permanece fixado em `ai@7.0.168`.

## Atualizar o conector já instalado no Linux

Antes de aplicar a atualização, aguarde pesquisas em andamento terminarem e feche o conector antigo. O atualizador não interrompe processos. Extraia o pacote G8 em uma pasta diferente da instalação atual e abra o terminal em `deploy/local-garimpo` dentro do pacote:

```bash
bash ATUALIZAR-GARIMPO-G8-LINUX.sh --check
bash ATUALIZAR-GARIMPO-G8-LINUX.sh
```

O atualizador procura uma única instalação em `~/Downloads/RealTalent-Garimpo-Conexao-*`. Para indicar outra instalação ou escolher entre várias, acrescente `--root /caminho/da/instalacao`. Esse caminho deve conter `deploy/local-garimpo/garimpo.env`.

Somente os módulos listados no manifesto são atualizados. O arquivo `garimpo.env`, o token e o modelo configurado não são alterados. O atualizador confere SHA-256, recusa versões desconhecidas/edições locais, cria backup e executa os testes G8 com respostas simuladas. Se um teste falhar, tenta restaurar o código anterior. Nenhum serviço novo, modelo ou dependência é instalado.

Depois da atualização, reabra `INICIAR-GARIMPO-LOCAL.sh` da instalação atualizada. Um processo já aberto mantém os módulos antigos na memória até reiniciar.

Para restaurar o último backup:

```bash
bash ATUALIZAR-GARIMPO-G8-LINUX.sh --restore
```

O backup fica em `.garimpo-g8-backups` dentro da instalação. A restauração preserva edições feitas depois da atualização, recusando sobrescrevê-las. Instalações antigas com outros módulos ou SDK incompatível exigem comparação antes da atualização; não substitua arquivos manualmente.

## Fluxo comercial

- Cadastro suficiente, empresa verificada e prontidão para transferência são estados separados, calculados pelo mesmo serviço.
- Ressalvas de identidade/localização exigem confirmação explícita. Responsável e motivos ficam junto à empresa. Uma mudança nesses dados invalida o aceite anterior.
- A investigação completa é salva automaticamente junto ao cadastro, sem modificar os contatos existentes. O cadastro mantém até vinte referências compactas de versões, consultáveis na revisão. O resultado atual completo fica junto à empresa e as versões completas continuam nos trabalhos por empresa no servidor.
- Instagram indisponível é uma limitação opcional. Falhas de extração ou de uma etapa essencial continuam aparecendo como falha parcial.
- Hipóteses, perguntas e próximos passos usam serviços, preços, canais e eventos com evidências. Não são afirmações de dor, orçamento ou intenção de compra.
- O coletor prioriza lacunas, mantém as consultas sequenciais no perfil de memória baixa e não repete uma consulta já registrada no mesmo trabalho.

O painel técnico informa a versão/modelo e quais provedores foram efetivamente utilizados. Crawl4AI só aparece como utilizado quando uma chamada ocorreu; o servidor interno SearXNG não é diagnosticado por este conector. O contrato antigo continua legível no CRM, com versão não informada, para permitir uma atualização gradual.

## Verificação na operação real

Os testes automatizados usam páginas e respostas simuladas. Após atualizar o CRM e o conector, investigue uma empresa conhecida, confira as fontes e os serviços publicados, recarregue a revisão e verifique a preservação do resultado. Teste aprovação e transferência em uma empresa de teste. Confira o modelo/versão no diagnóstico e meça o tempo e o uso de memória no Linux. Os testes locais de desenvolvimento não comprovam o funcionamento da sua instância Firecrawl/Ollama ou da base de produção.
