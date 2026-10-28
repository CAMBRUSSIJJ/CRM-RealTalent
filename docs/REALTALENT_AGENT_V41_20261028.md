# RealTalent Agent V4.1 — Tools Engine

## Delivered
- Deterministic calculator for percentages, target gross margins, markups, discounts, commissions, conversion based on explicitly supplied counts, remaining goal balances and basic operations. Brazilian numeric format supported. No dynamic eval.
- Script Studio directly inside Agent; generates editable commercial call, meeting, WhatsApp and email playbook scripts, optionally grounded in a visible focused lead and the existing CRM coaching plan.
- Dedicated result cards in the Assistant: result + formula + assumptions; script + copy + save as **inactive** Playbook using the existing app action and permission gate.
- Integrated route in the AI Gateway before slow model planning, without altering mutation confirmations.
- Automated tests and CI QA.

## Limits
- No general-purpose code-execution sandbox and no arbitrary Python/JS execution. Requests for programming scripts continue through the existing Agent instead of being mistaken for sales scripts.
- Scripts use structured CRM-aware templates in this increment, not freeform Ollama text generation. Creative rewriting via isolated language generation is a later enhancement.
- Calculations use provided numbers. Historical CRM conversion and forecasts are still handled by existing analytics; the calculator does not imply it read the entire database.
- Financial results are commercial estimates, not a tax calculation. All results show formula and assumptions.
- For persistence, Playbook saves are explicit, permission checked, and inactive for review.
- Production and database remain unchanged.

## Manual acceptance
- Open Assistant and send "quanto é 10% de 1500", "custo R$ 100, margem de 30%", "desconto 10% em R$ 1500", "conversão de 50 contatos e 8 vendas", "crie um roteiro de ligação".
- Verify cards in Firefox at 1280x720 and 390px mobile; copy script; save to Playbook using a writable test workspace.
- Verify hidden records never appear in scripts, and scripts do not automatically send messages.
- Test real Ollama and authenticated CRM integration before production.
