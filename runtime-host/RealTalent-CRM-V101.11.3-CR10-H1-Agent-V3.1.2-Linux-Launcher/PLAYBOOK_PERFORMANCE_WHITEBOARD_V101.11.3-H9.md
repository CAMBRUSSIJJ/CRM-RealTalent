# Playbook Performance & Interactive Whiteboard — V101.11.3-H9

## Objetivo
Transformar o mapa H8 em um whiteboard comercial mais fluido e expressivo sem abandonar o Conversation Graph como fonte única de verdade.

## Pipeline de interação
Pointer events -> fila curta -> requestAnimationFrame -> atualização do grafo -> render.

O pointermove bruto deixa de disparar um update React para cada evento físico. Isso é especialmente relevante em mouses de 500/1000 Hz e trackpads modernos.

## Performance adaptativa
- Excelente: >=55 FPS.
- Boa: 45–54 FPS.
- Reduzida: <45 FPS.

Em modo reduzido a UI remove decoração não essencial antes de sacrificar interação.

## Whiteboard
Cada `PlaybookConversationNode` pode persistir `color`. Grade e snap são preferências locais de edição; o conteúdo comercial continua no mesmo `guidance.conversationGraph`.

## Login
Os pontos interativos são elementos leves. O clique cria apenas um burst temporário limitado, evitando sistemas de partículas infinitos em JavaScript.
