# RealTalent Agent V2.5 — Multimodal Intelligence

## Objetivo

Transformar imagem, screenshot e comparação visual em evidência operacional do cérebro da Agent, e não apenas em “um anexo que o modelo recebe”.

## Arquitetura

```text
Mensagem + imagens
        ↓
Attachment-aware intent
        ↓
Multimodal Planner
        ↓
Image normalization + metadata
        ↓
Vision / Perception Pass
        ↓
Structured visual evidence
(findings, visibleText, regions, confidence, uncertainties)
        ↓
Grounding
        ↓
Reasoning / Synthesis
        ↓
Verifier / Repair
        ↓
Resposta + Visual Evidence
```

## Evidência visual

Cada finding possui confiança e região normalizada. A política do runtime é fail-closed para pixels: sem Vision real, nenhuma afirmação visual nova deve ser inventada.

## Continuidade entre turnos

A resposta salva apenas um snapshot estruturado do que foi observado, sem duplicar os pixels. Em um turno posterior:

- “esse botão”;
- “essa parte”;
- “essa tela”;
- “e aqui?”

podem resolver para `visual_context` quando houver evidência suficiente. Se a referência não for sustentada, o Reference Resolver não deve chutar.

## Modos

- `general_visual`
- `ui_diagnosis`
- `compare`
- `chart_analysis`
- `document_visual`
- `visual_reference`
- `visual_follow_up`

## Segurança contra alucinação visual

- pixels requerem Vision;
- observação visível e inferência são tratadas separadamente;
- incertezas são preservadas;
- findings abaixo da confiança mínima são descartados;
- a síntese recebe a percepção estruturada em vez de refazer a leitura visual do zero.

## Compatibilidade

A V2.5 preserva Tool-First, App Context Bridge, Commercial Readiness, Model Router, Context Engine, Verifier, memória semântica, RAG híbrido e reranking das versões anteriores.
