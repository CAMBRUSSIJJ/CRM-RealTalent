# RealTalent — Skills de Marketing e Vendas
Biblioteca de **14 Skills de agente** em português para Codex e agentes compatíveis com o formato Agent Skills `SKILL.md`.
Criadas sobre o CRM RealTalent sem instalar dependências nem modificar a execução do produto.

## Conteúdo
**Marketing:** marketing-strategy, market-research-icp, content-copywriting, campaign-measurement.
**Vendas:** prospecting-sales-intelligence, decision-maker-mapping, lead-qualification, consultative-selling, sales-outreach, buyer-psychology, objection-negotiation, conversation-intelligence, proposal-deal-strategy, revenue-intelligence.

## Uso com Codex (skills do repositório)
Ao abrir o Codex dentro deste repositório, os arquivos em `.agents/skills/<nome>/SKILL.md` podem ser descobertos pelo agente. Abra nova sessão quando necessário.
Exemplos de pedidos:
- "Usa a Skill prospecting-sales-intelligence para pesquisar um conjunto de empresas de [setor] em [cidade]; só aceite dados com fontes."
- "Usa lead-qualification para revisar esta oportunidade, mostrando a lógica do score e as lacunas."
- "Usa conversation-intelligence para analisar esta conversa autorizada e sugerir uma resposta humanizada, sem enviar."
- "Usa revenue-intelligence para auditar o pipeline a partir desta exportação."

## Instalação global no Linux
Se quiser utilizar as mesmas Skills em outros projetos, a partir da raiz do repositório:
```bash
mkdir -p ~/.agents/skills
cp -R .agents/skills/. ~/.agents/skills/
python3 scripts/validate-sales-skills.py
```
Em outros computadores, clone o repositório ou copie o diretório `.agents/skills` para o mesmo caminho global. O comando `cp` pode sobrescrever Skills de nomes iguais: faça backup se já estiverem presentes.

## Instalação global no Windows (PowerShell)
```powershell
New-Item -ItemType Directory -Force "$HOME\.agents\skills" | Out-Null
Copy-Item ".agents\skills\*" "$HOME\.agents\skills" -Recurse -Force
```

## Verificação
```bash
python3 scripts/validate-sales-skills.py
```
O script verifica estrutura, metadados e critérios mínimos; **não testa semanticamente** execução por modelos nem integração com serviços.

## Limites importantes
- Adicionar Skills ao repositório **não ativa** IA comercial dentro do aplicativo, nem modifica o frontend, backend ou Vercel.
- Os modelos só podem consultar fontes e ferramentas efetivamente conectadas.
- As Skills não enviam WhatsApp, e-mail, campanhas, propostas nem criam leads sem revisão/autorização.
- Veja `docs/SALES-SKILLS-INTEGRATION.md` para contrato futuro de runtime e pontos do código.
- O repositório principal consultado usa a base V100.51.1 na branch main em 18/11/2026; versões mais novas em outras branches exigem reconciliação antes de integrar ao runtime.
