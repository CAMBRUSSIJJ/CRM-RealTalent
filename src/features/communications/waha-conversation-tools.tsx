import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BrainCircuit, Check, Clipboard, FileText, LoaderCircle, Paperclip, Star, Tag, X } from 'lucide-react'
import { stageWahaTaskHandoff } from '../../services/waha-task-handoff'
import { useAppActions, useAppWorkspace } from '../../app/app-context'
import { routeToHash } from '../../app/route-state'
import {
  wahaAiStatus, wahaAnalyzeSelectedConversation, wahaMediaBlob, wahaTranscribeMessage,
  wahaAutoReplyStatus, wahaSetAutoReply, wahaSend, type WahaAutoReplyStatus,
  type WahaCommercialReport, type WahaAiConversationTask,
  type WahaChat, type WahaMessage, type WahaPreferences,
  type WahaQuickReply,
} from '../../services/waha-direct'

export type WahaToolMode='overview'|'labels'|'replies'|'ai'
type Props={
  mode:WahaToolMode;token:string;chats:WahaChat[];selected:WahaChat|null;messages:WahaMessage[];prefs:WahaPreferences;linkedLeadId?:string|null
  onClose():void;onInsert(text:string):void
  onPreference(patch:unknown):Promise<void>
}
const unreadCount=(c:WahaChat)=>Number(c.unreadCount||0)
const chatName=(c:WahaChat)=>c.name||c.id.split('@')[0]

export function WahaToolsDrawer({mode,token,chats,selected,messages,prefs,linkedLeadId,onClose,onInsert,onPreference}:Props){
  const { snapshot,canWrite }=useAppWorkspace()
  const { createActivity }=useAppActions()
  const linkedLead=linkedLeadId ? snapshot?.leads.find((lead)=>lead.id===linkedLeadId) ?? null : null
  const [savingCrmContext,setSavingCrmContext]=useState(false)
  const [crmContextSaved,setCrmContextSaved]=useState(false)
  const [labels,setLabels]=useState('')
  const [replyTitle,setReplyTitle]=useState('')
  const [replyText,setReplyText]=useState('')
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)
  const [aiResult,setAiResult]=useState('')
  const [commercial,setCommercial]=useState<WahaCommercialReport|null>(null)
  const [question,setQuestion]=useState('')
  const [messagesRead,setMessagesRead]=useState(0)
  const [voiceInfo,setVoiceInfo]=useState<{textMessagesRead:number;audioDetected:number;audioTranscribed:number;audioSkipped:number;audioTranscripts:{id:string;text:string}[]}|null>(null)
  const activeChatId=useRef(selected?.id||'')
  activeChatId.current=selected?.id||''
  const requestEpoch=useRef(0)
  const [aiModel,setAiModel]=useState('')
  const [aiAvailable,setAiAvailable]=useState(false)
  const [aiChecked,setAiChecked]=useState(false)
  const [aiTask,setAiTask]=useState<WahaAiConversationTask>('summary')
  const [autoReply,setAutoReply]=useState<WahaAutoReplyStatus|null>(null)
  const [autoSaving,setAutoSaving]=useState(false)
  const [replySending,setReplySending]=useState(false)
  const [replySent,setReplySent]=useState(false)

  useEffect(()=>{setLabels((selected&&prefs.labels[selected.id]||[]).join(', '))},[selected?.id,prefs.labels])
  useEffect(()=>{requestEpoch.current+=1;setAiResult('');setCommercial(null);setQuestion('');setMessagesRead(0);setVoiceInfo(null);setError('');setReplySent(false);setAutoReply(null);setCrmContextSaved(false)},[selected?.id,mode])
  useEffect(()=>{
    if(mode!=='ai')return
    let active=true
    void wahaAiStatus(token).then(v=>{
      if(active){setAiAvailable(v.available);setAiModel(v.models.find(x=>/qwen/i.test(x))||v.models[0]||'');setAiChecked(true)}
    }).catch(()=>{if(active){setAiChecked(true);setAiAvailable(false)}})
    return()=>{active=false}
  },[mode,token])

  useEffect(()=>{
    if(mode!=='ai'||!selected?.id)return
    let active=true
    const selectedChat=selected.id
    const refresh=()=>{
      void wahaAutoReplyStatus(token,selectedChat).then(status=>{
        if(active)setAutoReply(status)
      }).catch(()=>{if(active)setAutoReply(null)})
    }
    refresh()
    const interval=window.setInterval(refresh,12000)
    return()=>{active=false;window.clearInterval(interval)}
  },[mode,token,selected?.id])

  async function toggleAutoReply(){
    if(!selected||autoSaving||!autoReply?.available)return
    const chatId=selected.id
    const enabling=!autoReply.enabled
    if(enabling&&!window.confirm(
      'ATIVAR RESPOSTAS AUTOMÁTICAS para '+chatName(selected)+'?'+
      '\n\nO assistente virtual enviará respostas REAIS sem revisão individual.'+
      '\nLimite: até 3 respostas por hora para esta conversa; 10 no total por hora.'+
      '\nFunciona apenas neste computador e desliga quando a ponte reinicia.'+
      '\n\nConfirma que deseja habilitar?'
    ))return
    setAutoSaving(true);setError('')
    try{
      const result=await wahaSetAutoReply(token,chatId,enabling)
      if(activeChatId.current===chatId)setAutoReply(result)
    }catch(e){setError(e instanceof Error?e.message:'Falha ao alterar atendimento automático.')}
    finally{setAutoSaving(false)}
  }

  async function sendApprovedReply(){
    if(!selected||replySending||aiTask!=='reply'||!aiResult.trim())return
    const chatId=selected.id
    const text=aiResult.trim().slice(0,750)
    if(!window.confirm('ENVIAR AGORA para '+chatName(selected)+'?'+
      '\n\n'+text+'\n\nEsta ação enviará uma mensagem real pelo WhatsApp.'))return
    setReplySending(true);setError('');setReplySent(false)
    try{
      await wahaSend(token,chatId,text,crypto.randomUUID())
      if(activeChatId.current===chatId){setAiResult('');setReplySent(true)}
    }catch(e){if(activeChatId.current===chatId)setError(
      (e instanceof Error?e.message:'Falha no envio.')+
      ' Confira a conversa antes de tentar novamente para evitar duplicidade.')}
    finally{setReplySending(false)}
  }

  function openNativeTask(description:string,evidenceText=''){
    if(!selected)return
    try{
      stageWahaTaskHandoff({
        title:description.slice(0,180),
        description:'Sugestão comercial para revisão • conversa WAHA: '+chatName(selected)+
          (evidenceText?'\nEvidência: '+evidenceText.slice(0,450):'')+
          '\nConfira a conversa antes de assumir qualquer compromisso.',
      })
      onClose()
      window.location.hash=routeToHash('tasks')
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível preparar a tarefa.')}
  }
  async function change(patch:unknown){
    setError('');setSaving(true)
    try{await onPreference(patch)}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.')}
    finally{setSaving(false)}
  }
  async function saveApprovedCommercialContext(){
    if(!selected||!commercial||!linkedLead||!snapshot||!canWrite||savingCrmContext||crmContextSaved)return
    const summary=commercial.summary.trim()
    if(!summary)return
    const preview=summary.slice(0,380)
    if(!window.confirm('Salvar este resumo de IA na ficha comercial de '+linkedLead.name+'?'+
      '\\n\\n'+preview+'\\n\\nConfira as evidências. A IA pode estar incorreta e nenhuma mensagem será enviada.'))return
    setSavingCrmContext(true);setError('')
    try{
      const format=(name:string,items:{description:string;evidence:{text:string}[]}[])=>items.length
        ? name+': '+items.slice(0,3).map(x=>x.description.slice(0,180)).join(' | ')
        : ''
      const body=[
        '[WAHA_CONTEXT_V1] Contexto comercial revisado pelo usuário',
        'Fonte: conversa WAHA '+chatName(selected)+' · '+messagesRead+' mensagens consideradas · IA local '+(aiModel||'Ollama'),
        'Confiança declarada pela IA: '+commercial.confidence,
        'Resumo: '+summary.slice(0,900),
        format('Necessidades',commercial.needs),
        format('Objeções',commercial.objections),
        format('Oportunidades',commercial.opportunities),
        format('Próximos passos sugeridos',commercial.nextSteps),
        'Limitações: '+commercial.limitations.slice(0,430),
        'Não é fato confirmado. Consulte a conversa original antes de agir.',
      ].filter(Boolean).join('\\n').slice(0,3500)
      await createActivity({
        leadId:linkedLead.id,type:'note',
        title:'📌 WhatsApp · contexto comercial revisado',description:body,
        dueAt:null,completedAt:null,assignedTo:null,
        resolutionReason:'pinned_call_note',purpose:'waha_commercial_context',
      })
      setCrmContextSaved(true)
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar a análise no CRM.')}
    finally{setSavingCrmContext(false)}
  }

  async function runAi(task:WahaAiConversationTask){
    if(!selected||!aiAvailable)return
    const epoch=++requestEpoch.current
    setError('');setAiResult('');setCommercial(null);setVoiceInfo(null);setReplySent(false);setCrmContextSaved(false);setAiTask(task);setSaving(true)
    try{
      // The local bridge reads actual messages directly from selected WAHA chat.
      // Generated content remains read-only until manually inserted and sent.
      const r=await wahaAnalyzeSelectedConversation(token,selected.id,task,task==='ask'?question.trim():'')
      if(epoch!==requestEpoch.current||r.chatId!==selected.id)return
      setAiResult(r.text||'');setCommercial(r.analysis||null)
      setAiModel(r.model);setMessagesRead(r.messagesRead)
      setVoiceInfo({textMessagesRead:r.textMessagesRead??r.messagesRead,
        audioDetected:r.audioDetected??0,audioTranscribed:r.audioTranscribed??0,
        audioSkipped:r.audioSkipped??0,audioTranscripts:r.audioTranscripts||[]})
    }catch(e){
      if(epoch===requestEpoch.current)setError(e instanceof Error?e.message:'Falha na IA local.')
    }finally{if(epoch===requestEpoch.current)setSaving(false)}
  }

  let content:ReactNode=null
  if(mode==='overview'){
    const unread=chats.reduce((a,c)=>a+unreadCount(c),0)
    const groups=chats.filter(c=>c.id.endsWith('@g.us')).length
    content=<>
      <p className="waha-panel-description">Indicadores das {chats.length} conversas carregadas, não de todo o histórico.</p>
      <div className="waha-stat-grid">
        <article><small>Conversas</small><strong>{chats.length}</strong></article>
        <article><small>Não lidas</small><strong>{unread}</strong></article>
        <article><small>Grupos</small><strong>{groups}</strong></article>
        <article><small>Favoritos</small><strong>{prefs.favorites.length}</strong></article>
      </div>
      <h4>Conversas recentes</h4>
      {chats.slice(0,6).map(c=><div key={c.id} className="waha-tool-row"><span>{chatName(c)}</span><small>{unreadCount(c)?unreadCount(c)+' não lidas':'Sem pendências registradas'}</small></div>)}
      <p className="waha-panel-description">As métricas detalhadas exigirão registro de estados de atendimento e histórico local.</p>
    </>
  }
  if(mode==='labels'){
    content=selected?<>
      <p className="waha-panel-description">Classifique <strong>{chatName(selected)}</strong>. As etiquetas são armazenadas no Linux e não alteram o WhatsApp oficial.</p>
      <label htmlFor="waha-labels-input">Etiquetas — até 8, separadas por vírgula</label>
      <input id="waha-labels-input" placeholder="Cliente ativo, Prioridade alta" maxLength={280} value={labels} onChange={e=>setLabels(e.target.value)}/>
      <button type="button" className="waha-primary" disabled={saving} onClick={()=>void change({type:'labels',chatId:selected.id,labels:[...new Set(labels.split(',').map(x=>x.trim()).filter(Boolean))].slice(0,8)})}><Check size={15}/> Salvar etiquetas</button>
      <div className="waha-label-preview">{(prefs.labels[selected.id]||[]).map(l=><span className="waha-label" key={l}><Tag size={12}/>{l}</span>)}</div>
      <button type="button" className="waha-quiet" onClick={()=>void change({type:'favorite',chatId:selected.id,enabled:!prefs.favorites.includes(selected.id)})}>
        <Star size={16} fill={prefs.favorites.includes(selected.id)?'currentColor':'none'}/> {prefs.favorites.includes(selected.id)?'Remover dos favoritos':'Adicionar aos favoritos'}
      </button>
    </>:<p className="waha-panel-description">Selecione uma conversa para classificar.</p>
  }
  if(mode==='replies'){
    content=<>
      <p className="waha-panel-description">Insira um modelo no campo de mensagem. Nenhuma resposta é enviada automaticamente.</p>
      <div className="waha-replies">{prefs.quickReplies.map((r:WahaQuickReply)=><article key={r.id} className="waha-reply-card">
        <strong>{r.title}</strong><p>{r.text}</p>
        <div><button type="button" disabled={!selected} onClick={()=>{onInsert(r.text);onClose()}}><Clipboard size={14}/> Inserir</button>
          <button type="button" onClick={()=>void change({type:'deleteReply',id:r.id})}><X size={14}/> Excluir</button></div>
      </article>)}</div>
      {!prefs.quickReplies.length?<p className="waha-panel-description">Ainda não há modelos cadastrados.</p>:null}
      <h4>Nova resposta rápida</h4>
      <label htmlFor="waha-reply-title">Título</label><input id="waha-reply-title" value={replyTitle} maxLength={45} onChange={e=>setReplyTitle(e.target.value)} placeholder="Saudação inicial"/>
      <label htmlFor="waha-reply-text">Texto</label><textarea id="waha-reply-text" value={replyText} maxLength={1600} rows={4} onChange={e=>setReplyText(e.target.value)} placeholder="Olá, tudo bem?"/>
      <button className="waha-primary" disabled={saving||!replyTitle.trim()||!replyText.trim()} type="button" onClick={()=>void (async()=>{await change({type:'reply',title:replyTitle,text:replyText});setReplyTitle('');setReplyText('')})()}><Check size={15}/> Salvar modelo</button>
    </>
  }
  if(mode==='ai'){
    const sections: {key:keyof Pick<WahaCommercialReport,'needs'|'objections'|'opportunities'|'nextSteps'>;title:string}[]=[
      {key:'needs',title:'Necessidades identificadas'},
      {key:'objections',title:'Objeções e dificuldades'},
      {key:'opportunities',title:'Oportunidades possíveis'},
      {key:'nextSteps',title:'Próximos passos sugeridos'},
    ]
    content=<>
      <p className="waha-panel-description">Assistente do WhatsApp: lê a conversa selecionada diretamente no <strong>WAHA</strong> e usa o <strong>Ollama local</strong>. Nunca envia mensagens automaticamente.</p>
      <div className="waha-ai-status"><BrainCircuit size={17}/>{!aiChecked?'Verificando Ollama...':aiAvailable?'Disponível: '+aiModel:'Ollama ou modelo local indisponível'}</div>
      {!selected?<p className="waha-panel-description">Selecione uma conversa à esquerda para que a IA leia suas mensagens reais.</p>:<>
        <section className="waha-auto-reply-control">
          <div><strong>Respostas automáticas</strong>
            <p>Desativadas por padrão. Apenas conversas individuais; a IA envia sem revisão somente quando você habilitar.</p>
            {autoReply?.enabled?<small role="status">Ativo · {autoReply.remainingHour??0} respostas restantes nesta hora · limite global de {autoReply.maxGlobalHour??10}/hora.</small>:
              <small>{selected.id.endsWith('@g.us')?'Indisponível para grupos.':'Desativado para este contato.'}</small>}
            {autoReply?.lastOutcome==='failed'?<small role="alert">Último envio não confirmado. Confira o histórico.</small>:null}
          </div>
          <button type="button" className={autoReply?.enabled?'is-on':''}
            disabled={!autoReply?.available||autoSaving||(!autoReply?.enabled&&!aiAvailable)}
            onClick={()=>void toggleAutoReply()}>
            {autoSaving?'Alterando...':autoReply?.enabled?'Desativar automático':'Ativar para este contato'}
          </button>
          <p className="waha-panel-description">
            Somente mensagens novas; máximo de 3 respostas/h por contato e 10/h no total.
            Não responde a grupos, ignora arquivos não suportados e para se o contato pedir para parar.
            Reiniciar a ponte desativa todos os atendimentos automáticos.
          </p>
        </section>
        <p className="waha-panel-description"><strong>Conversa:</strong> {chatName(selected)}. Até 45 mensagens recentes (texto e áudios recebidos transcritos) entram na análise. A transcrição usa Whisper local, no máximo 3 áudios de até 3 minutos por solicitação.</p>
        <div className="waha-ai-actions">
          <button type="button" disabled={!aiAvailable||saving} onClick={()=>void runAi('summary')}><FileText size={15}/> Resumir conversa</button>
          <button type="button" disabled={!aiAvailable||saving} onClick={()=>void runAi('reply')}><BrainCircuit size={15}/> Responder com IA</button>
          <button type="button" className="waha-analysis-main" disabled={!aiAvailable||saving} onClick={()=>void runAi('commercial')}><Clipboard size={15}/> Análise comercial</button>
        </div>
        <label htmlFor="waha-ai-question">Perguntar sobre esta conversa</label>
        <div className="waha-ai-question">
          <textarea id="waha-ai-question" rows={3} maxLength={450} placeholder="Ex.: O cliente demonstrou interesse? Quais problemas ele mencionou?" value={question} onChange={e=>setQuestion(e.target.value)}/>
          <button className="waha-primary" type="button" disabled={!aiAvailable||saving||question.trim().length<4} onClick={()=>void runAi('ask')}>Perguntar à IA</button>
        </div>
        {saving?<p className="waha-panel-description" role="status"><LoaderCircle size={15} className="spin"/> Lendo mensagens e transcrevendo áudios no Linux antes de consultar o Ollama...</p>:null}
        {commercial?<div className="waha-ai-result waha-commercial-result" aria-live="polite">
          <h4>Análise comercial <small>Confiança indicada: {commercial.confidence}</small></h4>
          <p className="waha-commercial-summary">{commercial.summary}</p>
          {linkedLead && canWrite ? <button className="waha-handoff-button" type="button"
            disabled={savingCrmContext||crmContextSaved} onClick={()=>void saveApprovedCommercialContext()}>
            <Clipboard size={15}/>{crmContextSaved ? 'Análise registrada na ficha do lead' : savingCrmContext ? 'Registrando no CRM…' : 'Revisar e salvar contexto no CRM · '+linkedLead.name}
          </button> : null}
          {sections.map(section=><section className="waha-commercial-section" key={section.key}>
            <h5>{section.title}</h5>
            {commercial[section.key].length===0?<p className="waha-panel-description">Não identificadas nas mensagens consultadas.</p>:null}
            {commercial[section.key].map((finding,index)=><article className="waha-commercial-finding" key={section.key+'-'+index}>
              <p>{finding.description}</p>
              <details><summary>Ver evidências ({finding.evidence.length})</summary>
                {finding.evidence.map(e=><blockquote key={e.id}><b>{e.id} · {e.fromMe?'Atendente':'Contato'}{e.source==='audio'?' · áudio transcrito':''}:</b> {e.text}</blockquote>)}
              </details>
              {section.key==='nextSteps'?<button type="button" className="waha-handoff-button"
                onClick={()=>openNativeTask(finding.description,finding.evidence[0]?.text||'')}>
                <Clipboard size={14}/> Preparar tarefa no CRM
              </button>:null}
            </article>)}
          </section>)}
          <p className="waha-panel-description"><strong>Limitações:</strong> {commercial.limitations}</p>
          <button type="button" disabled={saving} onClick={()=>void runAi('reply')}><BrainCircuit size={15}/> Preparar resposta para revisar</button>
        </div>:null}
        {aiResult?<div className="waha-ai-result" aria-live="polite">
          <h4>{aiTask==='reply'?'Resposta sugerida':aiTask==='ask'?'Resposta sobre a conversa':'Resumo da conversa'}</h4>
          <p>{aiResult}</p>
          {aiTask==='reply'?<div className="waha-ai-reply-buttons">
            <button type="button" onClick={()=>{onInsert(aiResult);onClose()}}>Inserir no campo para revisar</button>
            <button type="button" disabled={replySending} onClick={()=>void sendApprovedReply()}>
              {replySending?'Enviando...':'Confirmar e enviar pelo WhatsApp'}
            </button>
          </div>:null}
        </div>:null}
        {replySent?<p role="status" className="waha-panel-description">Envio solicitado ao WAHA. Confira a confirmação na conversa.</p>:null}
        {messagesRead>0?<div className="waha-panel-description" role="status">
          Fonte: {messagesRead} mensagens consideradas ({voiceInfo?.textMessagesRead??messagesRead} de texto,
          {' '}{voiceInfo?.audioTranscribed??0} áudios transcritos localmente) · {aiModel}. Nenhuma resposta enviada.
          {(voiceInfo?.audioSkipped??0)>0?<p role="alert"><strong>Análise parcial:</strong> {voiceInfo?.audioSkipped} áudio(s)
            recebido(s) não foram transcritos (mídia ausente, limite de 3 ou transcritor não instalado).
            Para ativar, execute <code>bash deploy/waha-direct/instalar-transcricao-local-linux.sh</code> no projeto Linux.</p>:null}
          {(voiceInfo?.audioTranscripts.length??0)>0?<details><summary>Ver transcrições utilizadas ({voiceInfo?.audioTranscripts.length})</summary>
            {voiceInfo?.audioTranscripts.map(a=><blockquote key={a.id}><strong>{a.id} · Áudio recebido:</strong> {a.text}</blockquote>)}
          </details>:null}
        </div>:null}
      </>}
      <section className="waha-crm-handoff" aria-label="Continuar no CRM">
        <h4>Continuar o atendimento no CRM</h4>
        <div className="waha-crm-links">
          <a href={routeToHash('leads')}>Contatos</a>
          <a href={routeToHash('pipeline')}>Pipeline</a>
          <a href={routeToHash('followups')}>Follow-ups</a>
          <a href={routeToHash('agenda')}>Agenda</a>
          <a href={routeToHash('tasks')}>Tarefas</a>
        </div>
        <p className="waha-panel-description">
          Preparar tarefa apenas abre o formulário preenchido. Revise e salve manualmente; a IA não envia mensagens nem cria negócios automaticamente.
        </p>
      </section>
      <p className="waha-panel-description">Análises são sugestões, não fatos garantidos. Confira as mensagens citadas e revise qualquer texto antes de enviá-lo ao contato.</p>
    </>
  }
  return <aside className="waha-tools-drawer" aria-label="Ferramentas do WhatsApp">
    <header className="waha-tools-drawer-head"><strong>{mode==='overview'?'Visão geral':mode==='labels'?'Etiquetas e favoritos':mode==='replies'?'Respostas rápidas':'Assistente IA local'}</strong><button type="button" onClick={onClose} aria-label="Fechar ferramentas"><X size={18}/></button></header>
    <div className="waha-tools-drawer-content">{content}{error?<p className="waha-error" role="alert">{error}</p>:null}</div>
  </aside>
}

export function WahaMessageMedia({message,token,chatId}:{message:WahaMessage;token:string;chatId:string}){
  const [url,setUrl]=useState('')
  const [error,setError]=useState('')
  const [retry,setRetry]=useState(0)
  const [transcript,setTranscript]=useState('')
  const [voiceError,setVoiceError]=useState('')
  const [transcribing,setTranscribing]=useState(false)
  const src=message.media?.url||message.mediaUrl||''
  const mime=message.media?.mimetype||''
  const filename=message.media?.filename||'Arquivo'
  const incomingVoice=mime.startsWith('audio/')&&!message.fromMe
  useEffect(()=>{
    if(!message.hasMedia||(!src&&!message.id))return
    let active=true,objectUrl=''
    setUrl('');setError('')
    void wahaMediaBlob(token,src,chatId,message.id).then(blob=>{
      if(!active)return
      objectUrl=URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Mídia indisponível.')})
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[message.id,src,message.hasMedia,token,chatId,retry])
  useEffect(()=>{setTranscript('');setVoiceError('');setTranscribing(false)},[chatId,message.id])
  async function transcribe(){
    if(transcribing)return
    setTranscribing(true);setVoiceError('')
    try{
      const response=await wahaTranscribeMessage(token,chatId,message.id)
      if(response.chatId===chatId&&response.messageId===message.id)setTranscript(response.text)
    }catch(e){
      setVoiceError(e instanceof Error?e.message:'Falha ao transcrever o áudio.')
    }finally{setTranscribing(false)}
  }
  if(!message.hasMedia)return null
  let media:ReactNode
  if(error){
    media=<p className="waha-media"><Paperclip size={15}/> {filename}: {error}{' '}
      <button type="button" onClick={()=>setRetry(x=>x+1)}>Tentar novamente</button>
    </p>
  }else if(!url){
    media=<p className="waha-media"><LoaderCircle className="spin" size={15}/> Carregando mídia...</p>
  }else if(mime.startsWith('image/')){
    media=<a href={url} target="_blank" rel="noopener noreferrer"><img className="waha-chat-image" src={url} alt="Imagem recebida"/></a>
  }else if(mime.startsWith('audio/')){
    media=<audio controls preload="none" src={url} className="waha-chat-audio"/>
  }else if(mime.startsWith('video/')){
    media=<video controls preload="none" src={url} className="waha-chat-video"/>
  }else{
    media=<a href={url} download={filename} className="waha-media-download"><Paperclip size={15}/>{filename}</a>
  }
  return <div className="waha-message-media">
    {media}
    {incomingVoice?<div className="waha-voice-transcription">
      <button type="button" className="waha-transcribe-btn" disabled={transcribing}
        onClick={()=>void transcribe()}>
        {transcribing?<LoaderCircle className="spin" size={14}/>:<BrainCircuit size={14}/>}
        {transcribing?'Transcrevendo no Linux...':transcript?'Transcrever novamente':'Transcrever áudio'}
      </button>
      {transcript?<div className="waha-voice-text"><strong>Transcrição local · confira o conteúdo</strong><p>{transcript}</p></div>:null}
      {voiceError?<p className="waha-voice-error" role="alert">{voiceError}</p>:null}
    </div>:null}
  </div>
}
