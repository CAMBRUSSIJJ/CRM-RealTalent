# RealTalent Agent V3.1 — Human Evaluation Rubric

This rubric is intentionally separate from deterministic self-tests. A 1000/1000 structural benchmark does **not** prove that prose feels intelligent to a human.

Score each real conversation from 0–5 on six dimensions:

1. **Understanding** — Did the Agent understand what the user actually meant, including informal wording and references?
2. **Accuracy / Grounding** — Are factual claims supported by available context, RAG, tools, image evidence or explicit uncertainty?
3. **Usefulness** — Does the response materially help the user take the next step?
4. **Naturalness** — Does it sound like a capable conversational assistant instead of a template or system log?
5. **Context discipline** — Did it retrieve relevant prior context while ignoring stale/unrelated topics?
6. **Efficiency** — Was the response proportional in length and latency to the task?

## Suggested baseline

Evaluate at least 40 real tasks:
- 8 everyday conversation
- 8 CRM/product questions
- 6 ambiguous references / follow-ups
- 6 RAG/document questions
- 4 screenshots / visual tasks
- 4 coding/debugging tasks
- 4 long/complex reasoning tasks

Maximum score: 1200 points (40 tasks × 6 dimensions × 5).

### Release interpretation
- **>= 1020 / 1200 (85%)**: strong perceived intelligence
- **900–1019**: acceptable but still inconsistent
- **< 900**: do not call the release an intelligence-quality improvement without investigating weak dimensions

Record verbatim user corrections such as “não foi isso”, “era esse botão”, “respondeu outra coisa” and promote objective failures to the existing Failure Memory / Regression Dataset.
