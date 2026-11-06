// Explicit, per-message voice transcription. No automatic WhatsApp sends or cloud services.
export const CHAT_ID=/^[A-Za-z0-9_-]{5,70}@(c\.us|lid|g\.us)$/
export const MESSAGE_ID=/^[A-Za-z0-9@_.:-]{5,250}$/
export async function transcribeOneReceivedMessage(input,{readMessages,transcribeMessages}={}){
  if(!CHAT_ID.test(input?.chatId||'')||!MESSAGE_ID.test(input?.messageId||'')){
    const error=new Error('Selecione um áudio válido da conversa');error.status=400;throw error
  }
  if(typeof readMessages!=='function'||typeof transcribeMessages!=='function'){
    const error=new Error('Transcritor local não configurado');error.status=503;throw error
  }
  // The caller never supplies media content or URLs. WAHA is the only source of truth.
  const raw=await readMessages(input.chatId)
  const message=Array.isArray(raw)?raw.find(item=>item?.id===input.messageId):null
  if(!message){
    const error=new Error('Mensagem não localizada no histórico recente do WAHA');error.status=404;throw error
  }
  if(message.fromMe===true||!message.hasMedia||!String(message.media?.mimetype||'').toLowerCase().startsWith('audio/')){
    const error=new Error('Apenas áudios recebidos podem ser transcritos nesta versão');error.status=422;throw error
  }
  const result=await transcribeMessages([message],input.chatId)
  const text=typeof result?.messages?.[0]?._localTranscript==='string'
    ?result.messages[0]._localTranscript.trim().slice(0,4500):''
  if(!text){
    const error=new Error('O áudio não pôde ser obtido ou transcrito localmente. Verifique o WAHA e o Whisper.')
    error.status=422;throw error
  }
  return {chatId:input.chatId,messageId:input.messageId,text,
    source:'waha-local-whisper',readOnly:true,sent:false}
}
