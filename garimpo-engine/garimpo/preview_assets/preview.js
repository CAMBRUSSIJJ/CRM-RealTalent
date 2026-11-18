const $ = id => document.getElementById(id);
const phases = {queued:'Na fila para começar.',discovery:'Procurando empresas na fonte selecionada…',collecting:'Conferindo os contatos publicados…',completed:'Pesquisa concluída.',failed:'A pesquisa encontrou uma falha.',timeout:'O tempo da pesquisa terminou.',cancelled:'Pesquisa cancelada. Os resultados anteriores foram preservados.'};
let activeId = null, timer = null, failures = 0;
let recoveryAvailable = false;
const terminal = new Set(['completed','failed','cancelled']);
const fieldNames={company:'Empresa',phone:'Telefone',email:'E-mail',website:'Site',city:'Cidade',state:'UF',address:'Endereço',cnpj:'CNPJ',instagram:'Instagram'};
function message(text, error=false) { $('message').textContent=text; $('message').className='message'+(error?' error':''); $('message').hidden=!text; }
async function api(path, options={}) {
  const response = await fetch('/preview-api/'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Garimpo-Preview':'1',...options.headers}});
  const data = await response.json();
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'Confira os parâmetros da pesquisa.';
    if(response.status===401) { $('workspace').hidden=true; $('locked').hidden=false; $('connection').textContent='Acesso privado'; clearTimeout(timer); }
    throw new Error(detail);
  }
  return data;
}
function node(tag,text,className) { const el=document.createElement(tag); if(text!==undefined)el.textContent=text; if(className)el.className=className; return el; }
function link(label,target) {
  const el=node('a',label);
  try { const url=new URL(target); if(!['https:','http:','mailto:','tel:'].includes(url.protocol))return node('span',label); el.href=url.href; if(['https:','http:'].includes(url.protocol)){el.target='_blank';el.rel='noopener noreferrer';} } catch { return node('span',label); }
  return el;
}
function renderResults(results, target=$('results')) {
  target.replaceChildren(); if(target.id==='results')$('empty').hidden=results.length>0;
  for(const item of results) {
    const article=node('article',undefined,'result-card'), top=node('div',undefined,'result-top'), identity=node('div');
    identity.append(node('h3',item.company||item.name||'Empresa','company'),node('p',[item.address,item.city,item.state].filter(Boolean).join(' · '),'address'));
    top.append(identity,node('span',`Correspondência ${item.engine?.relevanceScore??0}/100`,'score')); article.append(top);
    const contacts=node('div',undefined,'contacts');
    if(item.phone)contacts.append(link(item.phone,'tel:'+item.phone.replace(/[^+\d]/g,'')));
    if(item.email)contacts.append(link(item.email,'mailto:'+item.email));
    if(item.website)contacts.append(link('Visitar site ↗',item.website));
    if(!item.phone&&!item.email)contacts.append(node('span','Sem telefone ou e-mail publicado nas fontes consultadas.'));
    article.append(contacts);
    if(item.engine?.collectionStatus==='enriching')article.append(node('p','Contato publicado encontrado; conferência do site em andamento.','small-note'));
    if(item.engine?.collectionStatus==='pending')article.append(node('p','Contato publicado preservado; conferência do site pendente de retomada.','small-note'));
    if(item.engine?.listing?.category)article.append(node('p',[item.engine.listing.category,item.engine.listing.rating?`Avaliação ${item.engine.listing.rating}/5`:null,Number.isInteger(item.engine.listing.review_count)?`${item.engine.listing.review_count} avaliações`:null].filter(Boolean).join(' · '),'small-note'));
    for(const signal of item.engine?.qualification?.signals??[])article.append(node('p',`${signal.value} — “${signal.quote}”`,'small-note'));
    if(item.engine?.pendingReasons?.length)article.append(node('p','Falta: '+item.engine.pendingReasons.map(reason=>reason==='missing_phone'?'telefone publicado':'e-mail publicado').join(' e ')+'.','small-note'));
    const details=node('details'), list=node('ul');
    details.append(node('summary','Conferir fontes e motivos da correspondência'));
    for(const reason of item.engine?.relevanceReasons??[])list.append(node('li',reason));
    for(const evidence of item.engine?.evidence??[]) { const li=node('li'); const when=new Date(evidence.observed_at); li.append(link(`${evidence.source} · ${Number.isNaN(when.getTime())?'data indisponível':when.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`,evidence.url),node('span',` — ${fieldNames[evidence.field]??evidence.field}: ${evidence.value}`));list.append(li); }
    for(const warning of item.engine?.warnings??[])list.append(node('li',warning));
    details.append(list);article.append(details);target.append(article);
  }
}
function render(job) {
  const done=terminal.has(job.status); $('start').disabled=!done; $('cancel').disabled=done; $('export').disabled=!(job.results?.length);
  $('resume').hidden=!job.can_resume;$('resume').disabled=!job.can_resume;
  const search=job.search_progress??{};
  $('search-progress').textContent=search.queries_planned?`${search.queries_started??0} de até ${search.queries_planned} consultas utilizadas${search.current&&!done?' · '+search.current.label+' · '+search.current.term:''}. A busca para quando atinge a quantidade solicitada.`:'';
  $('phase').textContent=phases[job.phase]||phases[job.status]||'Processando…';
  $('discovered').textContent=job.discovered??0; $('processed').textContent=job.processed??0; $('returned').textContent=job.results?.length??0;
  $('progress').max=Math.max(1,job.discovered??0);
  if(!done)$('progress').removeAttribute('value');
  else $('progress').value=job.status==='completed'?$('progress').max:(job.processed??0);
  $('progress').classList.toggle('failed',job.status==='failed');
  const source=$('source-status');
  source.className='source-status';
  if(job.status==='failed'){source.textContent='Pesquisa não concluída. Consulte a falha apresentada abaixo.';source.classList.add('failed');}
  else if(!done)source.textContent='Pesquisa em andamento; a disponibilidade da fonte está sendo verificada.';
  else if(job.status==='cancelled')source.textContent='Pesquisa cancelada. A disponibilidade da fonte não foi confirmada.';
  else {source.textContent='Pesquisa concluída com os dados disponíveis na fonte ou no cache.';source.classList.add('ready');}
  const m=job.metrics??{}; const cached=(m.provider_cache_hits??0)+(m.website_cache_hits??0)+(m.robots_cache_hits??0);
  $('diagnostics').textContent=`${m.local_index_queries??0} consultas à base preparada · ${m.discovery_requests??0} consultas externas · ${m.website_requests??0} acessos aos sites · ${cached} usos do cache · ${Math.round((m.duration_ms??0)/1000)} s de processamento`;
  const rejectionNames={missing_phone:'sem telefone publicado',missing_email:'sem e-mail publicado',wrong_location:'em outra localidade',unobserved_location:'sem cidade observada',below_minimum_relevance:'abaixo da correspondência mínima'};
  const rejections=Object.entries(m.rejected??{}).filter(([,count])=>count>0).map(([reason,count])=>`${count} ${rejectionNames[reason]??'fora dos filtros'}`);
  if(rejections.length)$('diagnostics').textContent+=' · Descartes: '+rejections.join('; ')+'.';
  renderResults(job.results??[]);
  const pending=job.pending??[];
  $('pending-panel').hidden=!pending.length;
  $('pending-count').textContent=pending.length;
  $('export-pending').disabled=!pending.length;
  $('recover').disabled=!done||!pending.length||(!recoveryAvailable&&!pending.some(item=>item.website));
  $('recovery-note').textContent=recoveryAvailable?'A recuperação procura o site e confere a identidade antes de aproveitar contatos.':'A busca de sites ainda precisa ser configurada. Os candidatos e suas fontes estão preservados para uma próxima tentativa.';
  renderResults(pending,$('pending-results'));
  $('diagnostics').textContent+=` · ${m.maps_runs??0} coletas Maps · ${m.maps_cache_hits??0} consultas ao cache Maps · ${m.recovery_queries??0} buscas de sites · ${m.recovered_with_phone??0} telefones recuperados`;
  if(m.first_result_ms!==undefined)$('diagnostics').textContent+=` · primeiro contato em ${(m.first_result_ms/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} s`;
  if(!job.results?.length){
    $('empty').querySelector('h3').textContent=job.status==='failed'?'A pesquisa não foi concluída.':job.status==='completed'?'Nenhuma empresa atendeu aos filtros.':job.status==='cancelled'?'A pesquisa foi cancelada.':'Consultando os dados da sua pesquisa…';
    $('empty').querySelector('p').textContent=job.status==='failed'?'A falha não significa que não existam empresas na região. A consulta precisa ser concluída antes de avaliar os resultados.':job.status==='completed'?'Confira os filtros e a cobertura da fonte. Contatos e endereços podem não ter sido publicados.':'Os contatos encontrados aparecerão aqui, com as fontes e os motivos de correspondência.';
    if(job.status==='completed'&&rejections.length)$('empty').querySelector('p').textContent='A consulta foi concluída. Registros descartados: '+rejections.join('; ')+'. Ajuste os filtros para consultar contatos menos completos.';
  }
  const warnings=[job.error,...(job.warnings??[])].filter(Boolean); message(warnings.join('\n'),job.status==='failed');
  if(done){sessionStorage.removeItem('garimpo-preview-active');clearTimeout(timer);}
}
async function poll() {
  if(!activeId)return;
  try { const job=await api('searches/'+activeId);failures=0;render(job);if(!terminal.has(job.status))timer=setTimeout(poll,1200); }
  catch(error){message(error.message,true);if(++failures<=4&&!$('workspace').hidden)timer=setTimeout(poll,3000);else{$('start').disabled=false;$('cancel').disabled=false;}}
}
$('search-form').addEventListener('submit',async event=>{
  event.preventDefault();clearTimeout(timer);message('');$('start').disabled=true;
  try { const job=await api('searches',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({segment:$('segment').value,city:$('city').value,state:$('state').value,provider:$('provider').value,limit:Number($('limit').value),require_phone:$('require-phone').checked,require_email:$('require-email').checked,require_observed_location:$('require-location').checked,enrich_websites:$('enrich').checked,minimum_relevance:Number($('relevance').value),qualify:$('qualify').checked,search_mode:$('expand-search').checked?'expanded':'standard'})});
    activeId=job.id;sessionStorage.setItem('garimpo-preview-active',activeId);failures=0;render(job);timer=setTimeout(poll,500);
  } catch(error){$('start').disabled=false;message(error.message,true);}
});
$('cancel').addEventListener('click',async()=>{if(!activeId)return;$('cancel').disabled=true;try{const job=await api('searches/'+activeId+'/cancel',{method:'POST',body:'{}'});render(job);}catch(error){message(error.message,true);$('cancel').disabled=false;}});
$('resume').addEventListener('click',async()=>{if(!activeId)return;$('resume').disabled=true;clearTimeout(timer);try{const job=await api('searches/'+activeId+'/resume',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:'{}'});activeId=job.id;sessionStorage.setItem('garimpo-preview-active',activeId);failures=0;message('');render(job);timer=setTimeout(poll,500);}catch(error){message(error.message,true);$('resume').disabled=false;}});
$('export').addEventListener('click',()=>{if(activeId)window.location.assign('/preview-api/searches/'+activeId+'/export');});
$('export-pending').addEventListener('click',()=>{if(activeId)window.location.assign('/preview-api/searches/'+activeId+'/pending');});
$('recover').addEventListener('click',async()=>{if(!activeId)return;$('recover').disabled=true;try{const job=await api('searches/'+activeId+'/recover',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:'{}'});activeId=job.id;sessionStorage.setItem('garimpo-preview-active',activeId);failures=0;render(job);timer=setTimeout(poll,500);}catch(error){message(error.message,true);$('recover').disabled=false;}});
async function start() {
  for(const uf of 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')){const option=node('option',uf);option.value=uf;option.selected=uf==='RS';$('state').append(option);}
  try {
    const access=new URLSearchParams(location.hash.slice(1)).get('access');
    if(access){history.replaceState(null,'',location.pathname);const response=await fetch('/preview-auth',{method:'POST',headers:{'Content-Type':'application/json','X-Garimpo-Preview':'1'},body:JSON.stringify({access})});if(!response.ok)throw new Error('Abra o link privado completo enviado nesta conversa.');}
    const capabilities=await api('capabilities');$('workspace').hidden=false;$('locked').hidden=true;$('connection').textContent='● API do motor disponível';$('connection').classList.add('ready');
    recoveryAvailable=!!capabilities.recovery?.website_search;
    const source=capabilities.osm_source;
    if(source?.status==='ready'){$('source-status').textContent=`Base preparada: ${source.label}. Extração de ${source.snapshot_at.slice(0,10)}. A cobertura será conferida para a cidade escolhida.`;}
    else if(source?.status==='unavailable'){$('source-status').textContent=source.message;$('source-status').classList.add('failed');}
    $('provider').querySelector('[value="brave"]').disabled=!capabilities.providers.brave;
    $('provider').querySelector('[value="hybrid"]').disabled=!capabilities.providers.brave;
    for(const name of ['maps','combined'])$('provider').querySelector(`[value="${name}"]`).disabled=!capabilities.providers.maps;
    if(capabilities.providers.maps){$('provider').value='maps';$('source-status').textContent='Google Maps disponível para a busca. Os resultados incluem contatos publicados e a fonte de cada informação.';}
    $('qualify').disabled=!capabilities.qualification?.available;
    $('qualification-note').textContent=capabilities.qualification?.available?'A análise usa apenas sinais publicados nas páginas consultadas.':'IA local não conectada; a pesquisa e a coleta de contatos continuam disponíveis.';
    for(const segment of capabilities.osm_segments){const option=node('option');option.value=segment;$('segments').append(option);}
    const previous=sessionStorage.getItem('garimpo-preview-active');if(previous&&/^[a-f0-9-]{36}$/.test(previous)){activeId=previous;await poll();}
  } catch(error){$('workspace').hidden=true;$('locked').hidden=false;$('connection').textContent='Acesso privado';message(error.message,true);}
}
start();
