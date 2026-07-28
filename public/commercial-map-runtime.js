(() => {
  if (window.__REALTALENT_LEAD_MAP_RUNTIME__) return;
  window.__REALTALENT_LEAD_MAP_RUNTIME__ = true;
  const CITY_COORDINATES = {
    canoas: [-29.9177, -51.1834], 'porto alegre': [-30.0346, -51.2177], esteio: [-29.8614, -51.1793],
    sapucaia: [-29.8333, -51.15], 'sapucaia do sul': [-29.8333, -51.15], 'sao leopoldo': [-29.7604, -51.1472],
    'novo hamburgo': [-29.6875, -51.1328], gravatai: [-29.9441, -50.9919], cachoeirinha: [-29.9472, -51.0939],
    viamao: [-30.0819, -51.0233], guaiba: [-30.1139, -51.325], alvorada: [-29.9914, -51.0809],
    'campo bom': [-29.6742, -51.0619], sapiranga: [-29.6381, -51.0067], pelotas: [-31.7654, -52.3376],
    'rio grande': [-32.035, -52.0986], 'caxias do sul': [-29.1678, -51.1794], caxias: [-29.1678, -51.1794],
    'santa maria': [-29.6842, -53.8069], 'santa cruz do sul': [-29.7175, -52.4258],
    'bento goncalves': [-29.1717, -51.5189], 'farroupilha': [-29.225, -51.3478], 'lageado': [-29.4669, -51.9614],
    lajeado: [-29.4669, -51.9614], 'novo santa rita': [-29.8525, -51.2744], 'eldorado do sul': [-30.0847, -51.6181]
  };
  const GEO_STATUS_LABEL = { exact:'Exata', manual:'Corrigida manualmente', approximate:'Aproximada', pending:'Aguardando', incomplete:'Incompleta', not_found:'Não encontrada' };
  const GEO_STATUS_TONE = { exact:'success', manual:'success', approximate:'info', pending:'warning', incomplete:'warning', not_found:'danger' };
  const GEO_PRECISION_LABEL = { rooftop:'Número do imóvel', range_interpolated:'Trecho da rua', street:'Rua', district:'Bairro', city:'Cidade', manual:'Ajuste manual', unknown:'Não informada' };
  const PRIORITY_LABEL = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };
  const PRIORITY_COLOR = { low: '#64748b', medium: '#2563eb', high: '#ea580c', urgent: '#dc2626' };
  const PROSPECT_STATUS = { new: 'Novo', analyzing: 'Analisando', review: 'Revisar', approved: 'Aprovado', discarded: 'Descartado', sent: 'Enviado' };
  const PROSPECT_SOURCE = { maps: 'Google Maps', instagram: 'Instagram', cnpj: 'CNPJ', extension: 'Extensão', manual: 'Manual' };
  const DEFAULT_STAGES = [
    { id: 'stage-new', name: 'Novo lead', color: '#4361ee' }, { id: 'stage-contact', name: 'Primeiro contato', color: '#3a86ff' },
    { id: 'stage-followup', name: 'Follow-up', color: '#8b5cf6' }, { id: 'stage-proposal', name: 'Proposta', color: '#f59e0b' },
    { id: 'stage-negotiation', name: 'Negociação', color: '#f97316' }, { id: 'stage-won', name: 'Fechado', color: '#16a34a' }
  ];
  const DEMO_LEADS = [
    { id:'lead-alpha', name:'Barbearia Alpha', company:'Barbearia Alpha', phone:'(51) 99999-1001', email:'contato@alpha.com.br', postalCode:'92010-000', street:'Rua Exemplo', addressNumber:'120', complement:'Loja 1', district:'Centro', city:'Canoas', state:'RS', country:'Brasil', latitude:-29.9183, longitude:-51.1819, formattedAddress:'Rua Exemplo, 120 · Centro · Canoas · RS', geocodeStatus:'manual', geocodePrecision:'manual', geocodeProvider:'manual', geocodedAt:new Date().toISOString(), stageId:'stage-proposal', status:'active', priority:'high', ownerName:'Camila', value:5000, nextActionAt:new Date(Date.now()-3600000).toISOString(), tags:['barbearia','bairro: Centro'] },
    { id:'lead-bronx', name:'The Bronx Barber Shop', company:'The Bronx', phone:'(51) 99826-6560', email:'contato@thebronx.com.br', postalCode:'90570-000', street:'Avenida Exemplo', addressNumber:'450', district:'Moinhos de Vento', city:'Porto Alegre', state:'RS', country:'Brasil', latitude:-30.0248, longitude:-51.2026, formattedAddress:'Avenida Exemplo, 450 · Moinhos de Vento · Porto Alegre · RS', geocodeStatus:'exact', geocodePrecision:'rooftop', geocodeProvider:'demo', geocodedAt:new Date().toISOString(), stageId:'stage-contact', status:'active', priority:'medium', ownerName:'Camila', value:3200, nextActionAt:new Date(Date.now()+7200000).toISOString(), tags:['barbearia','bairro: Moinhos de Vento'] },
    { id:'lead-diamond', name:'Diamond Barbearia', company:'Diamond Barbearia', phone:'(51) 98454-6144', email:'leo@diamond.com.br', postalCode:'92410-000', street:'Rua das Acácias', addressNumber:'88', district:'Igara', city:'Canoas', state:'RS', country:'Brasil', geocodeStatus:'pending', geocodePrecision:'unknown', stageId:'stage-followup', status:'active', priority:'urgent', ownerName:'Camila', value:4200, nextActionAt:new Date(Date.now()+86400000).toISOString(), tags:['barbearia','quente','bairro: Igara'] },
    { id:'lead-morada', name:'Morada Barbearia', company:'Morada Barbearia', phone:'(51) 99700-3311', email:'', postalCode:'', street:'', addressNumber:'', district:'Niterói', city:'Canoas', state:'RS', country:'Brasil', geocodeStatus:'approximate', geocodePrecision:'district', stageId:'stage-new', status:'active', priority:'low', ownerName:'Camila', value:2500, nextActionAt:new Date(Date.now()+172800000).toISOString(), tags:['barbearia','bairro: Niterói'] }
  ];

  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const hash = value => Array.from(String(value)).reduce((h,c)=>((h<<5)-h+c.charCodeAt(0))|0,0);
  const initials = value => String(value || '?').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
  const currency = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(value)||0);
  const dateTime = value => {
    if (!value) return 'Sem próxima ação';
    const d = new Date(value); if (Number.isNaN(d.getTime())) return 'Data inválida';
    return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
  };
  const safeColor = value => /^#[0-9a-f]{6}$/i.test(String(value||'')) ? value : '#2563eb';
  const isOverdue = item => item.nextActionAt && new Date(item.nextActionAt).getTime() <= Date.now();
  const districtOf = lead => {
    if (String(lead.district || '').trim()) return String(lead.district).trim();
    const tag = (lead.tags || []).find(item => /^bairro\s*:/i.test(item));
    if (tag) return tag.replace(/^bairro\s*:/i, '').trim() || 'Não informado';
    const match = String(lead.notes || '').match(/bairro\s*:\s*([^,;\n]+)/i);
    return match?.[1]?.trim() || 'Não informado';
  };
  const hasCoordinates = item => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
  const geoStatusOf = item => {
    const status=String(item.geocodeStatus||'');
    if (GEO_STATUS_LABEL[status]) return status;
    if (hasCoordinates(item)) return 'exact';
    if (!String(item.city||'').trim()) return 'incomplete';
    return 'approximate';
  };
  const fullAddress = item => item.formattedAddress || [
    [item.street,item.addressNumber].filter(Boolean).join(', '), item.complement, item.district, item.city, item.state, item.postalCode, item.country||'Brasil'
  ].map(value=>String(value||'').trim()).filter(Boolean).join(' · ');
  const locate = (item, kind = 'lead') => {
    if (kind === 'lead' && hasCoordinates(item)) return { kind, item, lat:Number(item.latitude), lng:Number(item.longitude), estimated:false, status:geoStatusOf(item) };
    const base = CITY_COORDINATES[normalize(item.city)]; if (!base) return null;
    const h = Math.abs(hash(`${kind}:${item.id}:${fullAddress(item)}`));
    const spread = kind === 'prospect' ? 5200 : String(item.street||'').trim() ? 12000 : 7000;
    return { kind, item, lat: base[0] + ((h % 101)-50)/spread, lng: base[1] + (((Math.floor(h/101))%101)-50)/spread, estimated:true, status:kind==='lead'?geoStatusOf(item):'approximate' };
  };
  const localEstimate = lead => {
    const base = CITY_COORDINATES[normalize(lead.city)];
    const now = new Date().toISOString();
    if (!base) return {
      latitude:null, longitude:null, geocodeStatus:String(lead.city||'').trim()?'not_found':'incomplete', geocodePrecision:'unknown',
      geocodeProvider:'city_fallback', geocodedAt:now,
      geocodeError:String(lead.city||'').trim()?'Cidade ainda não reconhecida no modo local.':'Informe pelo menos a cidade do lead.'
    };
    const h=Math.abs(hash(`${lead.id}:${fullAddress(lead)||lead.city}`));
    const spread=String(lead.street||'').trim()?12500:7000;
    return {
      latitude:base[0]+((h%101)-50)/spread, longitude:base[1]+(((Math.floor(h/101))%101)-50)/spread,
      formattedAddress:fullAddress(lead)||String(lead.city||''), geocodeStatus:'approximate',
      geocodePrecision:String(lead.street||'').trim()?'street':String(lead.district||'').trim()?'district':'city',
      geocodeProvider:'city_fallback', geocodedAt:now,
      geocodeError:'Estimativa local. Conecte a Edge Function para obter a posição real do endereço.'
    };
  };
  const distanceKm = (a, b) => {
    const rad = value => value * Math.PI / 180;
    const earth = 6371;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const lat1 = rad(a.lat), lat2 = rad(b.lat);
    const value = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
    return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1-value));
  };
  const storageGet = key => { try { return window.localStorage.getItem(key) } catch { return null } };
  const storageSet = (key, value) => { try { window.localStorage.setItem(key, value); return true } catch { return false } };
  const storageRemove = key => { try { window.localStorage.removeItem(key) } catch { /* armazenamento indisponível */ } };
  const download = (name, content, type='text/csv;charset=utf-8') => {
    const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  };
  const readDatabase = () => {
    const workspace = storageGet('realtalent-crm-v100-active-workspace') || 'local-demo';
    let leads = DEMO_LEADS, stages = DEFAULT_STAGES;
    try {
      const raw = storageGet('realtalent-crm-v100-local');
      if (raw) {
        const db = JSON.parse(raw);
        const savedLeads = Array.isArray(db.leads) ? db.leads.filter(l => !workspace || l.workspaceId === workspace) : [];
        const savedStages = Array.isArray(db.stages) ? db.stages.filter(s => !workspace || s.workspaceId === workspace) : [];
        if (savedLeads.length) leads = savedLeads;
        if (savedStages.length) stages = savedStages;
      }
    } catch { /* usa demonstração */ }
    const bridge = window.__REALTALENT_LEAD_MAP_BRIDGE__;
    try {
      const bridgedLeads = bridge?.getLeads?.();
      if (Array.isArray(bridgedLeads)) leads = bridgedLeads;
    } catch { /* mantém a base local */ }
    let prospects = [];
    try {
      const raw = storageGet(`realtalent-crm-v100-prospecting:${workspace}`);
      const parsed = raw ? JSON.parse(raw) : null;
      prospects = Array.isArray(parsed?.prospects) ? parsed.prospects : [];
    } catch { prospects = []; }
    return { workspace, leads, stages, prospects };
  };
  const loadLeaflet = () => {
    if (window.L) return Promise.resolve(window.L);
    if (window.__rtMapLeaflet) return window.__rtMapLeaflet;
    window.__rtMapLeaflet = new Promise((resolve,reject)=>{
      if (!document.querySelector('link[data-rt-map-leaflet]')) {
        const link=document.createElement('link'); link.rel='stylesheet'; link.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'; link.dataset.rtMapLeaflet='1'; document.head.appendChild(link);
      }
      const existing=document.querySelector('script[data-rt-map-leaflet]');
      if(existing){existing.addEventListener('load',()=>resolve(window.L));existing.addEventListener('error',reject);return;}
      const script=document.createElement('script'); script.src='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'; script.async=true; script.dataset.rtMapLeaflet='1'; script.onload=()=>resolve(window.L); script.onerror=reject; document.head.appendChild(script);
    });
    return window.__rtMapLeaflet;
  };
  const findNav = label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label);
  const navigate = label => findNav(label)?.click();

  const mount = root => {
    if (!root || root.dataset.mounted === '463') return;
    root.dataset.mounted='463';
    const db=readDatabase();
    const state={
      search:'', city:'all', stage:'all', owner:'all', priority:'all', geoStatus:'all', overdue:false,
      markerMode:'stage', view:'markers', heatMetric:'count', showProspects:false, tab:'leads', baseMap:'light', expanded:false,
      selected:null, selectedKind:'lead', selectedIds:new Set(), radiusKm:0, radiusCenter:null,
      areaMode:false, areaStart:null, rectangle:null, map:null, ready:false, fallback:false, baseLayer:null,
      leadLayer:null, heatLayer:null, prospectLayer:null, radiusLayer:null, selectionLayer:null,
      filtered:[], locations:[], mappedProspects:[], regionRows:[], processing:false
    };
    root.innerHTML = `
      <div class="page-stack commercial-map-page commercial-map-runtime-page commercial-map-v100462 commercial-map-v100463">
        <section class="commercial-map-hero panel">
          <div class="commercial-map-hero__copy">
            <span class="eyebrow">Operação geográfica · V100.46.5</span>
            <h2>Mapa de Leads</h2>
            <p>Visualize sua carteira por território, encontre concentrações e execute ações comerciais sem sair do mapa.</p>
          </div>
          <div class="commercial-map-hero__actions">
            <span class="commercial-map-mode" data-map-mode><i></i><span>Preparando mapa</span></span>
            <button class="button button--secondary button--sm" data-map-diagnostics type="button">Diagnóstico</button>
            <button class="button button--primary button--sm" data-geocode-visible type="button">Processar localizações</button>
          </div>
        </section>

        <section class="commercial-map-summary" data-summary></section>

        <section class="commercial-map-toolbar panel">
          <div class="commercial-map-toolbar__top">
            <label class="commercial-map-search"><span aria-hidden="true">⌕</span><input data-filter="search" placeholder="Buscar lead, empresa, cidade, telefone ou endereço"></label>
            <div class="commercial-map-layer"><span>Exibição</span><button data-view="markers" class="is-active" type="button">Pontos</button><button data-view="heat" type="button">Calor</button><button data-view="hybrid" type="button">Mista</button></div>
            <div class="commercial-map-layer"><span>Cor por</span><button data-marker-mode="stage" class="is-active" type="button">Etapa</button><button data-marker-mode="priority" type="button">Prioridade</button></div>
            <label class="commercial-map-inline-select" data-heat-control hidden><span>Métrica</span><select data-filter="heatMetric"><option value="count">Quantidade</option><option value="value">Valor de pipeline</option><option value="overdue">Ações atrasadas</option></select></label>
            <button class="button button--ghost button--sm rt-clear-map-filters" type="button">Limpar filtros</button>
          </div>
          <div class="commercial-map-toolbar__filters">
            <label><span>Cidade</span><select data-filter="city"></select></label>
            <label><span>Etapa</span><select data-filter="stage"></select></label>
            <label><span>Responsável</span><select data-filter="owner"></select></label>
            <label><span>Prioridade</span><select data-filter="priority"><option value="all">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label>
            <label><span>Localização</span><select data-filter="geoStatus"><option value="all">Todos os status</option><option value="exact">Exata</option><option value="manual">Corrigida</option><option value="approximate">Aproximada</option><option value="pending">Aguardando</option><option value="incomplete">Incompleta</option><option value="not_found">Não encontrada</option></select></label>
            <label class="commercial-map-check"><input data-filter="overdue" type="checkbox"><span>Somente atrasados</span></label>
            <label class="commercial-map-check"><input data-filter="showProspects" type="checkbox"><span>Mostrar Garimpo</span></label>
          </div>
        </section>

        <section class="commercial-map-workspace">
          <div class="commercial-map-canvas panel">
            <div class="commercial-intelligence-bar">
              <div class="commercial-radius-control"><span>Raio comercial</span><select data-radius><option value="0">Sem raio</option><option value="2">2 km</option><option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option><option value="50">50 km</option></select><button data-radius-apply type="button">Usar lead selecionado</button><button data-radius-clear type="button" hidden>Limpar raio</button></div>
              <div class="commercial-area-actions"><button data-area type="button">Selecionar área</button><button data-visible type="button">Selecionar visíveis</button><button data-location-queue type="button">Pendências</button><span data-selection-count>Nenhum lead selecionado</span></div>
            </div>
            <div class="commercial-map-frame">
              <div class="commercial-map-element" data-map></div>
              <div class="commercial-map-state" data-map-state><span class="commercial-map-loader"></span><strong>Carregando mapa comercial</strong><span>Preparando territórios e pontos da carteira.</span></div>
              <div class="commercial-map-floating-legend" data-legend></div>
              <div class="commercial-map-control-stack">
                <div class="commercial-map-basemap" aria-label="Estilo do mapa"><button data-basemap="light" class="is-active" type="button">Claro</button><button data-basemap="streets" type="button">Ruas</button><button data-basemap="dark" type="button">Escuro</button></div>
                <button class="commercial-map-control" data-fit-all type="button" title="Ajustar todos os pontos">Ajustar visão</button>
                <button class="commercial-map-control" data-fullscreen type="button" title="Expandir mapa">Tela cheia</button>
                <button class="commercial-map-control" data-center type="button" hidden>Centralizar lead</button>
              </div>
              <div class="commercial-map-precision" data-precision-note><span>●</span><span>Coordenadas salvas têm prioridade; estimativas ficam identificadas no mapa.</span></div>
              <div class="commercial-map-selection-bar" data-selection-bar hidden></div>
            </div>
          </div>

          <aside class="commercial-map-side panel">
            <header class="commercial-map-side__header"><div><span class="eyebrow">Carteira territorial</span><h3>Explorar leads</h3></div><span class="commercial-map-side__count" data-count></span></header>
            <div data-selected></div>
            <div class="commercial-map-tabs" role="tablist"><button data-tab="leads" class="is-active" type="button">Leads</button><button data-tab="location" type="button">Localização</button><button data-tab="regions" type="button">Regiões</button><button data-tab="prospects" type="button">Garimpo</button></div>
            <div class="commercial-map-list-heading"><div><strong data-list-title>Leads nesta visão</strong><span>Selecione um item para centralizar no mapa</span></div><span>☰</span></div>
            <div class="commercial-map-list" data-list></div>
            <div data-unmapped></div>
          </aside>
        </section>
        <div class="commercial-geocode-modal" data-geocode-modal hidden></div>
      </div>`;

    const q = selector => root.querySelector(selector);
    const qa = selector => [...root.querySelectorAll(selector)];
    const cities=[...new Set(db.leads.map(l=>String(l.city||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const owners=[...new Set(db.leads.map(l=>String(l.ownerName||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    q('[data-filter="city"]').innerHTML='<option value="all">Todas as cidades</option>'+cities.map(v=>`<option>${esc(v)}</option>`).join('');
    q('[data-filter="stage"]').innerHTML='<option value="all">Todas as etapas</option>'+db.stages.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
    q('[data-filter="owner"]').innerHTML='<option value="all">Todos</option>'+owners.map(v=>`<option>${esc(v)}</option>`).join('');

    const stageFor = id => db.stages.find(s=>s.id===id) || {name:'Sem etapa',color:'#64748b'};
    const selectedLead = () => state.filtered.find(l=>l.id===state.selected);
    const selectedProspect = () => db.prospects.find(p=>p.id===state.selected);
    const selectedLocation = () => state.selectedKind === 'lead' ? state.locations.find(loc=>loc.item.id===state.selected) : state.mappedProspects.find(loc=>loc.item.id===state.selected);
    const notify = message => {
      let toast = root.querySelector('.commercial-map-toast');
      if (!toast) { toast=document.createElement('div'); toast.className='commercial-map-toast'; root.appendChild(toast); }
      toast.textContent=message; toast.classList.add('is-visible'); clearTimeout(toast._timer); toast._timer=setTimeout(()=>toast.classList.remove('is-visible'),2600);
    };
    const bridge = () => window.__REALTALENT_LEAD_MAP_BRIDGE__;
    const canWrite = () => bridge()?.canWrite !== false;
    const replaceLead = lead => {
      const index=db.leads.findIndex(item=>item.id===lead.id);
      if(index>=0) db.leads[index]=lead; else db.leads.unshift(lead);
    };
    const patchLocalLead = (leadId, input) => {
      const lead=db.leads.find(item=>item.id===leadId); if(!lead) throw new Error('Lead não encontrado.');
      const next={...lead,...input,updatedAt:new Date().toISOString()}; replaceLead(next);
      try {
        const raw=storageGet('realtalent-crm-v100-local');
        if(raw){const local=JSON.parse(raw);const index=(local.leads||[]).findIndex(item=>item.id===leadId);if(index>=0){local.leads[index]={...local.leads[index],...input,updatedAt:next.updatedAt};storageSet('realtalent-crm-v100-local',JSON.stringify(local));}}
      } catch { /* mantém a alteração na sessão */ }
      return next;
    };
    const persistLeadPatch = async (leadId,input) => {
      if(!canWrite()) throw new Error('Seu perfil está em modo somente leitura.');
      const activeBridge=bridge();
      const lead=activeBridge?.updateLead ? await activeBridge.updateLead(leadId,input) : patchLocalLead(leadId,input);
      if(lead) replaceLead(lead);
      return lead;
    };
    const refreshBridgeLeads = () => {
      try { const leads=bridge()?.getLeads?.(); if(Array.isArray(leads)) db.leads=leads; } catch { /* mantém a base atual */ }
    };
    const queueLeads = () => state.filtered.filter(lead=>!['exact','manual'].includes(geoStatusOf(lead)));
    const setProcessing = active => {
      state.processing=active;
      const button=q('[data-geocode-visible]');
      if(button){button.disabled=active||!canWrite();button.textContent=active?'Processando…':'Processar localização';}
    };
    const geocodeLead = async leadId => {
      if(!canWrite()){notify('Seu perfil está em modo somente leitura.');return null;}
      const lead=db.leads.find(item=>item.id===leadId); if(!lead) return null;
      try {
        setProcessing(true);
        const activeBridge=bridge();
        let updated=null;
        if(activeBridge?.geocodeLead) updated=await activeBridge.geocodeLead(leadId);
        else updated=await persistLeadPatch(leadId,localEstimate(lead));
        if(updated) replaceLead(updated); else refreshBridgeLeads();
        notify(activeBridge?.mode==='supabase'?'Localização consultada no serviço conectado.':'Estimativa local atualizada. Conecte o Supabase para precisão real.');
        drawAll(true);
        return updated;
      } catch(error) {
        notify(error instanceof Error?error.message:'Falha ao localizar o lead.');
        return null;
      } finally { setProcessing(false); }
    };
    const runDiagnostics = async () => {
      const activeBridge=bridge();
      if(!activeBridge?.diagnoseMaps){notify('Diagnóstico disponível somente no módulo V100.46.5.');return;}
      const button=q('[data-map-diagnostics]');
      try {
        if(button){button.disabled=true;button.textContent='Diagnosticando…';}
        const diagnostic=await activeBridge.diagnoseMaps();
        const coverage=diagnostic?.coverage||{};
        const queue=diagnostic?.queue||{};
        const queueTotal=Object.values(queue).reduce((sum,value)=>sum+(Number(value)||0),0);
        notify(`${diagnostic.mode==='connected'?'Maps conectado':'Modo demonstração'} · ${coverage.mapped||0}/${coverage.total||0} localizados · ${coverage.percentage||0}% de cobertura${queueTotal?` · ${queueTotal} na fila`:''}.`);
      } catch(error) { notify(error instanceof Error?error.message:'Falha ao executar o diagnóstico do Maps.'); }
      finally { if(button){button.disabled=false;button.textContent='Diagnóstico do Maps';} }
    };
    const geocodeVisible = async () => {
      if(!canWrite()){notify('Seu perfil está em modo somente leitura.');return;}
      const ids=queueLeads().map(lead=>lead.id).slice(0,100);
      if(!ids.length){notify('Nenhuma pendência geográfica nesta visão.');return;}
      try {
        setProcessing(true);
        const activeBridge=bridge();
        if(activeBridge?.geocodeMany) {
          const result=await activeBridge.geocodeMany(ids);
          refreshBridgeLeads();
          notify(`${result.processed||0} processadas · ${result.queued||0} enfileiradas · ${result.exact||0} exatas · ${result.approximate||0} aproximadas.`);
        } else {
          for(const id of ids) await geocodeLead(id);
        }
        drawAll(true);
      } catch(error) { notify(error instanceof Error?error.message:'Falha ao processar a fila.'); }
      finally { setProcessing(false); }
    };
    const regionMetrics = leads => {
      const groups = new Map();
      leads.forEach(lead=>{
        const city = lead.city || 'Sem cidade'; const row=groups.get(city)||{city,count:0,value:0,overdue:0,won:0,lost:0,districts:new Set()};
        row.count++; row.value += Number(lead.value)||0; if(isOverdue(lead))row.overdue++; if(lead.status==='won')row.won++; if(lead.status==='lost')row.lost++; row.districts.add(districtOf(lead)); groups.set(city,row);
      });
      return [...groups.values()].map(row=>({...row,conversion:(row.won+row.lost)?Math.round(row.won/(row.won+row.lost)*100):0})).sort((a,b)=>b.count-a.count||b.value-a.value);
    };
    const prospectRows = () => db.prospects.filter(p=>!['discarded','sent'].includes(p.status)).filter(p=>state.city==='all'||p.city===state.city).filter(p=>!state.search||normalize([p.name,p.company,p.city,p.phone,p.address].join(' ')).includes(normalize(state.search)));

    const applyFilters = () => {
      const term=normalize(state.search),now=Date.now();
      let filtered=db.leads.filter(l=>l.status!=='archived')
        .filter(l=>!term||normalize([l.name,l.company,l.phone,l.email,l.city,l.street,l.addressNumber,l.district,l.postalCode,l.formattedAddress,...(l.tags||[])].join(' ')).includes(term))
        .filter(l=>state.city==='all'||l.city===state.city)
        .filter(l=>state.stage==='all'||l.stageId===state.stage)
        .filter(l=>state.owner==='all'||l.ownerName===state.owner)
        .filter(l=>state.priority==='all'||l.priority===state.priority)
        .filter(l=>state.geoStatus==='all'||geoStatusOf(l)===state.geoStatus)
        .filter(l=>!state.overdue||(l.nextActionAt&&new Date(l.nextActionAt).getTime()<=now));
      if (state.radiusCenter && state.radiusKm > 0) filtered = filtered.filter(lead => { const loc=locate(lead); return loc && distanceKm(state.radiusCenter,loc) <= state.radiusKm; });
      state.filtered=filtered;
      state.locations=filtered.map(lead=>locate(lead)).filter(Boolean);
      let prospects=prospectRows().map(prospect=>locate(prospect,'prospect')).filter(Boolean);
      if (state.radiusCenter && state.radiusKm > 0) prospects=prospects.filter(loc=>distanceKm(state.radiusCenter,loc)<=state.radiusKm);
      state.mappedProspects=prospects;
      state.regionRows=regionMetrics(filtered);
      state.selectedIds=new Set([...state.selectedIds].filter(id=>filtered.some(lead=>lead.id===id)));
      if(state.selectedKind==='lead'&&state.selected&&!filtered.some(l=>l.id===state.selected))state.selected=null;
      if(state.selectedKind==='prospect'&&state.selected&&!prospects.some(l=>l.item.id===state.selected))state.selected=null;
    };
    const renderSummary = () => {
      const pipeline=state.filtered.reduce((sum,l)=>sum+(Number(l.value)||0),0), late=state.filtered.filter(isOverdue).length;
      const exact=state.filtered.filter(lead=>['exact','manual'].includes(geoStatusOf(lead))&&hasCoordinates(lead)).length;
      const approximate=state.filtered.filter(lead=>geoStatusOf(lead)==='approximate'||(locate(lead)?.estimated&&!['incomplete'].includes(geoStatusOf(lead)))).length;
      const pending=state.filtered.filter(lead=>['pending','incomplete','not_found'].includes(geoStatusOf(lead))).length;
      q('[data-summary]').innerHTML=`
        <article class="commercial-map-kpi"><span class="commercial-map-kpi__icon">◎</span><div><span>Leads na visão</span><strong>${state.filtered.length}</strong><small>${state.locations.length} posicionados · ${state.selectedIds.size} selecionados</small></div></article>
        <article class="commercial-map-kpi is-success"><span class="commercial-map-kpi__icon">✓</span><div><span>Localização confiável</span><strong>${exact}</strong><small>${approximate} em posição aproximada</small></div></article>
        <article class="commercial-map-kpi ${pending?'is-warning':''}"><span class="commercial-map-kpi__icon">!</span><div><span>Pendências geográficas</span><strong>${pending}</strong><small>${pending?`${pending} ${pending===1?'registro exige':'registros exigem'} revisão`:'Endereços processados'}</small></div></article>
        <article class="commercial-map-kpi"><span class="commercial-map-kpi__icon">R$</span><div><span>Pipeline territorial</span><strong>${currency(pipeline)}</strong><small>${late} ${late===1?'ação atrasada':'ações atrasadas'}</small></div></article>`;
    };
    const renderLegend = () => {
      const box=q('[data-legend]');
      if(state.view==='heat') { box.innerHTML=`<strong>Concentração</strong><span><i class="legend-heat legend-heat--low"></i>Baixa</span><span><i class="legend-heat legend-heat--high"></i>Alta</span>`; return; }
      const stages=db.stages.filter(stage=>state.filtered.some(lead=>lead.stageId===stage.id));
      box.innerHTML='<strong>Legenda</strong>'+(state.markerMode==='stage'?stages.map(stage=>`<span><i style="background:${safeColor(stage.color)}"></i>${esc(stage.name)}</span>`):Object.keys(PRIORITY_LABEL).map(key=>`<span><i style="background:${PRIORITY_COLOR[key]}"></i>${PRIORITY_LABEL[key]}</span>`)).join('')+'<span><i class="legend-geo legend-geo--exact"></i>Coordenada salva</span><span><i class="legend-geo legend-geo--estimated"></i>Estimativa</span>'+(state.showProspects?'<span><i class="legend-prospect"></i>Garimpo</span>':'');
    };
    const drawSelected = () => {
      const box=q('[data-selected]'), center=q('[data-center]');
      if(!state.selected){center.hidden=true;box.innerHTML='<div class="commercial-map-empty-selection"><span class="commercial-map-empty-selection__icon">◎</span><strong>Selecione um lead no mapa</strong><p>Os detalhes, a situação geográfica e as ações comerciais aparecerão aqui.</p></div>';return;}
      const location=selectedLocation(); center.hidden=!location;
      if(state.selectedKind==='prospect'){
        const prospect=selectedProspect(); if(!prospect){state.selected=null;drawSelected();return;}
        box.innerHTML=`<div class="commercial-map-lead-card commercial-map-prospect-card"><header><span class="lead-avatar prospect-avatar">${esc(initials(prospect.name))}</span><div><span class="eyebrow">Prospect do Garimpo</span><h3>${esc(prospect.name)}</h3><p>${esc(prospect.company||'Empresa não informada')}</p></div><button class="icon-button" data-close-selected type="button">×</button></header><div class="commercial-map-lead-meta"><span>📍 ${esc(prospect.city||'Cidade não informada')}</span><span>◈ ${esc(PROSPECT_SOURCE[prospect.source]||prospect.source||'Origem não informada')}</span><span>✓ Confiança ${Number(prospect.confidence)||0}%</span></div><div class="commercial-map-lead-value"><span>Status</span><strong>${esc(PROSPECT_STATUS[prospect.status]||prospect.status)}</strong></div><div class="commercial-map-lead-actions"><button class="button button--primary button--sm" data-open-garimpo type="button">Abrir Garimpo</button><button class="button button--secondary button--sm" data-route-prospect type="button">Rota</button></div></div>`;
        box.querySelector('[data-close-selected]').addEventListener('click',()=>{state.selected=null;drawAll(false)});
        box.querySelector('[data-open-garimpo]').addEventListener('click',()=>navigate('Garimpo'));
        box.querySelector('[data-route-prospect]').addEventListener('click',()=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${prospect.company||prospect.name}, ${prospect.address||prospect.city}`)}`,'_blank','noopener,noreferrer'));
        return;
      }
      const lead=selectedLead(); if(!lead){state.selected=null;drawSelected();return;} const stage=stageFor(lead.stageId);
      const geoStatus=geoStatusOf(lead), precision=lead.geocodePrecision||'unknown', address=fullAddress(lead)||'Endereço não informado';
      box.innerHTML=`<div class="commercial-map-lead-card"><header><span class="lead-avatar">${esc(initials(lead.name))}</span><div><span class="eyebrow">Lead no território</span><h3>${esc(lead.name)}</h3><p>${esc(lead.company||'Empresa não informada')}</p></div><button class="icon-button" data-close-selected type="button">×</button></header><div class="commercial-geocode-badge commercial-geocode-badge--${esc(GEO_STATUS_TONE[geoStatus]||'info')}"><strong>${esc(GEO_STATUS_LABEL[geoStatus]||geoStatus)}</strong><span>${esc(GEO_PRECISION_LABEL[precision]||precision)}${lead.geocodedAt?` · ${dateTime(lead.geocodedAt)}`:''}</span></div><div class="commercial-map-lead-meta"><span>📍 ${esc(address)}</span><span>👤 ${esc(lead.ownerName||'Não atribuído')}</span><span>◉ ${esc(stage.name)}</span></div>${lead.geocodeError?`<div class="commercial-geocode-error">${esc(lead.geocodeError)}</div>`:''}<div class="commercial-map-lead-value"><span>Valor estimado</span><strong>${currency(lead.value)}</strong></div><div class="commercial-map-next-action"><span>Próxima ação</span><strong>${dateTime(lead.nextActionAt)}</strong></div><div class="commercial-map-geocode-actions"><button class="button button--secondary button--sm" data-geocode-one type="button">Geocodificar</button><button class="button button--secondary button--sm" data-correct-location type="button">Corrigir posição</button></div><div class="commercial-map-lead-actions"><button class="button button--primary button--sm" data-call type="button" ${lead.phone?'':'disabled'}>Ligar</button><button class="button button--secondary button--sm" data-whatsapp type="button" ${lead.phone?'':'disabled'}>WhatsApp</button><button class="button button--secondary button--sm" data-route type="button">Rota</button></div><button class="commercial-map-open-lead" data-open-leads type="button">Abrir na base de Leads <span>›</span></button></div>`;
      box.querySelector('[data-close-selected]').addEventListener('click',()=>{state.selected=null;drawAll(false)});
      box.querySelector('[data-call]').addEventListener('click',()=>{window.location.href=`tel:${lead.phone}`});
      box.querySelector('[data-whatsapp]').addEventListener('click',()=>{const digits=String(lead.phone).replace(/\D/g,'');window.open(`https://wa.me/${digits.startsWith('55')?digits:`55${digits}`}`,'_blank','noopener,noreferrer')});
      box.querySelector('[data-route]').addEventListener('click',()=>{const loc=locate(lead);const query=hasCoordinates(lead)?`${lead.latitude},${lead.longitude}`:fullAddress(lead)||`${lead.company||lead.name}, ${lead.city}`;window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,'_blank','noopener,noreferrer')});
      box.querySelector('[data-geocode-one]').addEventListener('click',()=>void geocodeLead(lead.id));
      box.querySelector('[data-correct-location]').addEventListener('click',()=>openGeocodeModal(lead));
      box.querySelector('[data-open-leads]').addEventListener('click',()=>navigate('Leads'));
    };
    const renderSelection = () => {
      q('[data-selection-count]').textContent=state.selectedIds.size?`${state.selectedIds.size} ${state.selectedIds.size===1?'lead selecionado':'leads selecionados'}`:'Nenhum lead selecionado';
      const bar=q('[data-selection-bar]'); bar.hidden=!state.selectedIds.size;
      if(!state.selectedIds.size){bar.innerHTML='';return;}
      bar.innerHTML=`<strong>${state.selectedIds.size} selecionado${state.selectedIds.size===1?'':'s'}</strong><button data-selection-geocode type="button">Geocodificar</button><button data-selection-leads type="button">Abrir em Leads</button><button data-selection-calls type="button">Criar fila de ligação</button><button data-selection-garimpo type="button">Pesquisar região no Garimpo</button><button data-selection-export type="button">Exportar CSV</button><button data-selection-clear type="button">Limpar</button>`;
      bar.querySelector('[data-selection-geocode]').addEventListener('click',async()=>{const ids=[...state.selectedIds];if(!ids.length)return;try{setProcessing(true);const activeBridge=bridge();if(activeBridge?.geocodeMany){const result=await activeBridge.geocodeMany(ids);refreshBridgeLeads();notify(`${result.processed||0} processadas · ${result.queued||0} enfileiradas.`);}else{for(const id of ids)await geocodeLead(id);notify(`${ids.length} localizações atualizadas no modo local.`);}drawAll(true);}catch(error){notify(error instanceof Error?error.message:'Falha ao geocodificar a seleção.')}finally{setProcessing(false)}});
      bar.querySelector('[data-selection-leads]').addEventListener('click',()=>transfer('leads'));
      bar.querySelector('[data-selection-calls]').addEventListener('click',()=>transfer('calls'));
      bar.querySelector('[data-selection-garimpo]').addEventListener('click',()=>transfer('prospecting'));
      bar.querySelector('[data-selection-export]').addEventListener('click',exportSelected);
      bar.querySelector('[data-selection-clear]').addEventListener('click',()=>{state.selectedIds.clear();drawAll(false)});
    };
    const transfer = target => {
      const leads=state.filtered.filter(lead=>state.selectedIds.has(lead.id));
      const context={source:'commercial-map-v100463',leadIds:leads.map(l=>l.id),cities:[...new Set(leads.map(l=>l.city).filter(Boolean))],radiusKm:state.radiusKm,createdAt:new Date().toISOString()};
      storageSet(`realtalent-map-${target}-context:${db.workspace}`,JSON.stringify(context));
      navigate(target==='prospecting'?'Garimpo':target==='calls'?'Ligações':'Leads');
    };
    const exportSelected = () => {
      const leads=state.filtered.filter(lead=>state.selectedIds.has(lead.id));
      const quote=value=>`"${String(value??'').replaceAll('"','""')}"`;
      const rows=[['Nome','Empresa','Telefone','Endereço','Cidade','Bairro','Etapa','Responsável','Prioridade','Valor','Status geográfico','Latitude','Longitude'],...leads.map(lead=>[lead.name,lead.company,lead.phone,fullAddress(lead),lead.city,districtOf(lead),stageFor(lead.stageId).name,lead.ownerName,PRIORITY_LABEL[lead.priority]||lead.priority,lead.value,GEO_STATUS_LABEL[geoStatusOf(lead)]||geoStatusOf(lead),lead.latitude??'',lead.longitude??''])];
      download('leads-selecionados-mapa-v100463.csv','\uFEFF'+rows.map(row=>row.map(quote).join(';')).join('\r\n'));
      notify('CSV exportado com os leads selecionados.');
    };
    const renderList = () => {
      const list=q('[data-list]'), title=q('[data-list-title]'), count=q('[data-count]');
      if(state.tab==='location'){
        const order={pending:0,incomplete:1,not_found:2,approximate:3,manual:4,exact:5};
        const rows=[...state.filtered].sort((a,b)=>(order[geoStatusOf(a)]??9)-(order[geoStatusOf(b)]??9)||a.name.localeCompare(b.name,'pt-BR'));
        const pending=rows.filter(lead=>!['exact','manual'].includes(geoStatusOf(lead))).length;
        title.textContent='Fila de localização'; count.textContent=`${pending} ${pending===1?'pendência':'pendências'}`;
        list.innerHTML=rows.length?rows.map(lead=>{const status=geoStatusOf(lead),address=fullAddress(lead)||'Endereço não informado';return `<div class="commercial-location-row ${state.selectedKind==='lead'&&state.selected===lead.id?'is-active':''}"><button data-location-lead="${esc(lead.id)}" type="button"><span class="lead-cell__avatar">${esc(initials(lead.name))}</span><span><strong>${esc(lead.name)}</strong><small>${esc(address)}</small></span><span class="commercial-geocode-mini commercial-geocode-mini--${esc(GEO_STATUS_TONE[status]||'info')}">${esc(GEO_STATUS_LABEL[status]||status)}</span></button><div><button data-location-geocode="${esc(lead.id)}" type="button" ${['exact','manual'].includes(status)?'disabled':''}>Processar</button><button data-location-correct="${esc(lead.id)}" type="button">Corrigir</button></div></div>`}).join(''):'<div class="commercial-map-no-results"><strong>Nenhum lead nesta visão</strong><span>Altere ou limpe os filtros.</span></div>';
        list.querySelectorAll('[data-location-lead]').forEach(button=>button.addEventListener('click',()=>{state.selected=button.dataset.locationLead;state.selectedKind='lead';drawAll(false)}));
        list.querySelectorAll('[data-location-geocode]').forEach(button=>button.addEventListener('click',()=>void geocodeLead(button.dataset.locationGeocode)));
        list.querySelectorAll('[data-location-correct]').forEach(button=>button.addEventListener('click',()=>{const lead=db.leads.find(item=>item.id===button.dataset.locationCorrect);if(lead)openGeocodeModal(lead)}));
        return;
      }
      if(state.tab==='regions'){
        title.textContent='Inteligência por região'; count.textContent=`${state.regionRows.length} ${state.regionRows.length===1?'cidade':'cidades'}`;
        list.innerHTML=state.regionRows.length?state.regionRows.map(row=>`<button class="commercial-region-row" data-region="${esc(row.city)}" type="button"><span class="commercial-region-rank">${state.regionRows.indexOf(row)+1}</span><span><strong>${esc(row.city)}</strong><small>${row.count} leads · ${row.districts.size} ${row.districts.size===1?'bairro':'bairros'} · ${currency(row.value)}</small><i><b style="width:${Math.max(8,Math.min(100,row.count/(state.regionRows[0]?.count||1)*100))}%"></b></i></span><span class="commercial-region-metric">${row.conversion}%<small>conversão</small></span></button>`).join(''):'<div class="commercial-map-no-results"><strong>Sem dados regionais</strong><span>Revise os filtros ou as cidades dos leads.</span></div>';
        list.querySelectorAll('[data-region]').forEach(button=>button.addEventListener('click',()=>{state.city=button.dataset.region;q('[data-filter="city"]').value=state.city;state.tab='leads';syncTabs();drawAll(true)}));
        return;
      }
      if(state.tab==='prospects'){
        const rows=prospectRows(); title.textContent='Prospects do Garimpo'; count.textContent=`${rows.length} ${rows.length===1?'resultado':'resultados'}`;
        list.innerHTML=rows.length?rows.map(prospect=>`<button data-prospect-id="${esc(prospect.id)}" class="${state.selectedKind==='prospect'&&state.selected===prospect.id?'is-active':''}" type="button"><span class="lead-cell__avatar prospect-avatar">${esc(initials(prospect.name))}</span><span><strong>${esc(prospect.name)}</strong><small>${esc(prospect.city||'Sem cidade')} · ${esc(PROSPECT_STATUS[prospect.status]||prospect.status)}</small></span><span>${Number(prospect.confidence)||0}%</span></button>`).join(''):'<div class="commercial-map-no-results"><strong>Nenhum prospect nesta visão</strong><span>Ative capturas no Garimpo ou altere a região.</span></div>';
        list.querySelectorAll('[data-prospect-id]').forEach(button=>button.addEventListener('click',()=>{state.selected=button.dataset.prospectId;state.selectedKind='prospect';drawAll(false)}));
        return;
      }
      title.textContent='Leads nesta visão'; count.textContent=`${state.filtered.length} ${state.filtered.length===1?'resultado':'resultados'}`;
      list.innerHTML=state.filtered.length?state.filtered.map(lead=>{const stage=stageFor(lead.stageId),mapped=!!locate(lead),checked=state.selectedIds.has(lead.id),status=geoStatusOf(lead);return `<div class="commercial-map-list-row ${state.selectedKind==='lead'&&state.selected===lead.id?'is-active':''}"><label class="commercial-map-row-check"><input data-select-id="${esc(lead.id)}" type="checkbox" ${checked?'checked':''}><span></span></label><button data-lead-id="${esc(lead.id)}" type="button"><span class="lead-cell__avatar">${esc(initials(lead.name))}</span><span><strong>${esc(lead.name)}</strong><small>${esc(lead.city||'Sem cidade')} · ${esc(stage.name)}</small></span><span class="commercial-geo-dot commercial-geo-dot--${esc(GEO_STATUS_TONE[status]||'info')}" title="${esc(GEO_STATUS_LABEL[status]||status)}">${mapped?'●':'!'}</span></button></div>`}).join(''):'<div class="commercial-map-no-results"><strong>Nenhum lead encontrado</strong><span>Altere ou limpe os filtros.</span></div>';
      list.querySelectorAll('[data-lead-id]').forEach(button=>button.addEventListener('click',()=>{state.selected=button.dataset.leadId;state.selectedKind='lead';drawAll(false)}));
      list.querySelectorAll('[data-select-id]').forEach(input=>input.addEventListener('change',()=>{input.checked?state.selectedIds.add(input.dataset.selectId):state.selectedIds.delete(input.dataset.selectId);drawAll(false)}));
    };
    const renderUnmapped = () => {
      const pending=state.filtered.filter(lead=>!['exact','manual'].includes(geoStatusOf(lead))), box=q('[data-unmapped]');
      box.innerHTML=pending.length?`<div class="commercial-map-unmapped"><span>!</span><div><strong>${pending.length} ${pending.length===1?'pendência geográfica':'pendências geográficas'}</strong><span>Revise endereços ou processe a fila de localização.</span></div><button data-review-location type="button">Abrir fila</button></div>`:'';
      box.querySelector('[data-review-location]')?.addEventListener('click',()=>{state.tab='location';syncTabs();renderList()});
    };
    const closeGeocodeModal = () => { const modal=q('[data-geocode-modal]');modal.hidden=true;modal.innerHTML=''; };
    const openGeocodeModal = lead => {
      if(!canWrite()){notify('Seu perfil está em modo somente leitura.');return;}
      const modal=q('[data-geocode-modal]'); const location=locate(lead);
      modal.hidden=false;
      modal.innerHTML=`<div class="commercial-geocode-backdrop" data-modal-close></div><section class="commercial-geocode-dialog" role="dialog" aria-modal="true" aria-label="Corrigir localização de ${esc(lead.name)}"><header><div><span class="eyebrow">Localização real</span><h3>Corrigir endereço e posição</h3><p>${esc(lead.name)} · ${esc(lead.company||'Empresa não informada')}</p></div><button class="icon-button" data-modal-close type="button">×</button></header><div class="commercial-geocode-form"><label><span>CEP</span><input name="postalCode" value="${esc(lead.postalCode||'')}" placeholder="92000-000"></label><label class="span-2"><span>Rua</span><input name="street" value="${esc(lead.street||'')}" placeholder="Rua ou avenida"></label><label><span>Número</span><input name="addressNumber" value="${esc(lead.addressNumber||'')}" placeholder="123"></label><label><span>Complemento</span><input name="complement" value="${esc(lead.complement||'')}" placeholder="Sala ou loja"></label><label><span>Bairro</span><input name="district" value="${esc(lead.district||districtOf(lead)||'')}" placeholder="Centro"></label><label><span>Cidade</span><input name="city" value="${esc(lead.city||'')}" placeholder="Canoas"></label><label><span>Estado</span><input name="state" maxlength="2" value="${esc(lead.state||'RS')}" placeholder="RS"></label><label><span>País</span><input name="country" value="${esc(lead.country||'Brasil')}" placeholder="Brasil"></label><div class="commercial-coordinate-divider span-2"><span>Posição manual</span><small>Use apenas quando quiser substituir a geocodificação automática.</small></div><label><span>Latitude</span><input name="latitude" inputmode="decimal" value="${hasCoordinates(lead)?esc(lead.latitude):location?String(location.lat.toFixed(6)):''}" placeholder="-29.917700"></label><label><span>Longitude</span><input name="longitude" inputmode="decimal" value="${hasCoordinates(lead)?esc(lead.longitude):location?String(location.lng.toFixed(6)):''}" placeholder="-51.183400"></label></div><div class="commercial-geocode-modal-note"><strong>Modo ${bridge()?.mode==='supabase'?'conectado':'local'}</strong><span>${bridge()?.mode==='supabase'?'Salvar o endereço permite consultar a Edge Function protegida.':'Sem Supabase, o CRM salva ajustes manuais e utiliza estimativas por cidade.'}</span></div><footer><button class="button button--ghost" data-modal-close type="button">Cancelar</button><button class="button button--secondary" data-use-map-center type="button">Usar centro do mapa</button><button class="button button--secondary" data-save-address type="button">Salvar e geocodificar</button><button class="button button--primary" data-save-manual type="button">Salvar posição manual</button></footer></section>`;
      const field=name=>modal.querySelector(`[name="${name}"]`);
      const readAddress=()=>({postalCode:field('postalCode').value.trim(),street:field('street').value.trim(),addressNumber:field('addressNumber').value.trim(),complement:field('complement').value.trim(),district:field('district').value.trim(),city:field('city').value.trim(),state:field('state').value.trim().toUpperCase(),country:field('country').value.trim()||'Brasil'});
      modal.querySelectorAll('[data-modal-close]').forEach(button=>button.addEventListener('click',closeGeocodeModal));
      modal.querySelector('[data-use-map-center]').addEventListener('click',()=>{const center=state.ready&&state.map?state.map.getCenter():location;if(!center){notify('O mapa ainda não possui um centro disponível.');return;}field('latitude').value=Number(center.lat).toFixed(6);field('longitude').value=Number(center.lng).toFixed(6);notify('Coordenadas preenchidas com o centro atual do mapa.')});
      modal.querySelector('[data-save-address]').addEventListener('click',async()=>{const address=readAddress();const status=!address.city?'incomplete':address.street&&address.addressNumber&&address.state?'pending':'approximate';const formatted=[[address.street,address.addressNumber].filter(Boolean).join(', '),address.complement,address.district,address.city,address.state,address.postalCode,address.country].filter(Boolean).join(' · ');try{await persistLeadPatch(lead.id,{...address,formattedAddress:formatted,latitude:null,longitude:null,geocodeStatus:status,geocodePrecision:status==='approximate'?(address.district?'district':'city'):'unknown',geocodeProvider:status==='approximate'?'city_fallback':null,geocodePlaceId:null,geocodedAt:null,geocodeError:null});closeGeocodeModal();drawAll(true);if(status!=='incomplete')await geocodeLead(lead.id);else notify('Endereço salvo. Informe a cidade para processar a localização.')}catch(error){notify(error instanceof Error?error.message:'Falha ao salvar o endereço.')}});
      modal.querySelector('[data-save-manual]').addEventListener('click',async()=>{const address=readAddress(),latitude=Number(String(field('latitude').value).replace(',','.')),longitude=Number(String(field('longitude').value).replace(',','.'));if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180){notify('Informe latitude e longitude válidas.');return;}const formatted=[[address.street,address.addressNumber].filter(Boolean).join(', '),address.complement,address.district,address.city,address.state,address.postalCode,address.country].filter(Boolean).join(' · ');try{await persistLeadPatch(lead.id,{...address,formattedAddress:formatted,latitude,longitude,geocodeStatus:'manual',geocodePrecision:'manual',geocodeProvider:'manual',geocodePlaceId:null,geocodedAt:new Date().toISOString(),geocodeError:null});closeGeocodeModal();drawAll(true);notify('Posição manual salva com sucesso.')}catch(error){notify(error instanceof Error?error.message:'Falha ao salvar a posição.')}});
    };
    const syncTabs = () => qa('[data-tab]').forEach(button=>button.classList.toggle('is-active',button.dataset.tab===state.tab));
    const renderFallback = () => {
      state.fallback=true; const box=q('[data-map]'); const locations=[...state.locations,...(state.showProspects?state.mappedProspects:[])];
      if(!locations.length){box.innerHTML='<div class="commercial-map-offline"><div class="offline-map-badge">Visualização simplificada · nenhum ponto nesta visão</div></div>';q('[data-map-state]')?.remove();return;}
      const lats=locations.map(x=>x.lat),lngs=locations.map(x=>x.lng),minLat=Math.min(...lats),maxLat=Math.max(...lats)+(Math.max(...lats)===Math.min(...lats)?.01:0),minLng=Math.min(...lngs),maxLng=Math.max(...lngs)+(Math.max(...lngs)===Math.min(...lngs)?.01:0);
      const point = loc => ({top:10+((maxLat-loc.lat)/(maxLat-minLat))*78,left:10+((loc.lng-minLng)/(maxLng-minLng))*78});
      const heat = state.view!=='markers'?state.regionRows.map(row=>{const items=state.locations.filter(loc=>loc.item.city===row.city);if(!items.length)return'';const lat=items.reduce((s,x)=>s+x.lat,0)/items.length,lng=items.reduce((s,x)=>s+x.lng,0)/items.length,p=point({lat,lng}),max=state.regionRows[0]?.count||1,size=48+row.count/max*82;return `<span class="offline-heat" style="--pin-top:${p.top}%;--pin-left:${p.left}%;--heat-size:${size}px"></span>`}).join(''):'';
      const leadPins=state.view!=='heat'?state.locations.map(loc=>{const p=point(loc),stage=stageFor(loc.item.stageId),color=state.markerMode==='priority'?PRIORITY_COLOR[loc.item.priority]||'#64748b':safeColor(stage.color);return `<button class="offline-map-pin${state.selectedKind==='lead'&&state.selected===loc.item.id?' is-selected':''}${state.selectedIds.has(loc.item.id)?' is-bulk-selected':''}${loc.estimated?' is-estimated':''}" data-offline-lead="${esc(loc.item.id)}" style="--pin-top:${p.top}%;--pin-left:${p.left}%;--pin-color:${color}" title="${esc(loc.estimated?'Posição aproximada':'Coordenada salva')}" type="button"><span>${esc(initials(loc.item.name))}</span></button>`}).join(''):'';
      const prospectPins=state.showProspects?state.mappedProspects.map(loc=>{const p=point(loc);return `<button class="offline-prospect-pin${state.selectedKind==='prospect'&&state.selected===loc.item.id?' is-selected':''}" data-offline-prospect="${esc(loc.item.id)}" style="--pin-top:${p.top}%;--pin-left:${p.left}%" type="button">◆</button>`}).join(''):'';
      box.innerHTML=`<div class="commercial-map-offline" role="img" aria-label="Mapa comercial simplificado"><div class="offline-road offline-road--one"></div><div class="offline-road offline-road--two"></div><div class="offline-road offline-road--three"></div>${heat}${leadPins}${prospectPins}<div class="offline-map-badge">Visualização simplificada · mapa interativo indisponível</div></div>`;
      box.querySelectorAll('[data-offline-lead]').forEach(button=>button.addEventListener('click',()=>{state.selected=button.dataset.offlineLead;state.selectedKind='lead';drawAll(false)}));
      box.querySelectorAll('[data-offline-prospect]').forEach(button=>button.addEventListener('click',()=>{state.selected=button.dataset.offlineProspect;state.selectedKind='prospect';drawAll(false)}));
      q('[data-map-state]')?.remove();
    };
    const renderMap = fit => {
      if(state.fallback&&!state.ready){renderFallback();return;}
      if(!state.ready||!state.map)return;
      const L=window.L; [state.leadLayer,state.heatLayer,state.prospectLayer,state.radiusLayer].forEach(layer=>layer?.clearLayers());
      if(state.view!=='markers'){
        const metrics=state.regionRows.map(row=>{const items=state.locations.filter(loc=>loc.item.city===row.city);const value=state.heatMetric==='value'?row.value:state.heatMetric==='overdue'?row.overdue:row.count;return{row,items,value}}).filter(item=>item.items.length&&item.value>0);
        const max=Math.max(1,...metrics.map(item=>item.value));
        metrics.forEach(item=>{const lat=item.items.reduce((s,x)=>s+x.lat,0)/item.items.length,lng=item.items.reduce((s,x)=>s+x.lng,0)/item.items.length,ratio=item.value/max,radius=18+ratio*28;L.circleMarker([lat,lng],{radius,color:'#1d4ed8',weight:1,fillColor:'#2563eb',fillOpacity:.16+ratio*.38}).bindTooltip(`<strong>${esc(item.row.city)}</strong><br>${state.heatMetric==='value'?currency(item.row.value):state.heatMetric==='overdue'?`${item.row.overdue} atrasadas`:`${item.row.count} leads`}`).addTo(state.heatLayer)});
      }
      if(state.view!=='heat'){
        const zoom=state.map.getZoom(),groups=new Map();
        state.locations.forEach(loc=>{const key=zoom<12?normalize(loc.item.city):loc.item.id;groups.set(key,[...(groups.get(key)||[]),loc])});
        groups.forEach(items=>{
          if(items.length>1&&zoom<12){const lat=items.reduce((s,x)=>s+x.lat,0)/items.length,lng=items.reduce((s,x)=>s+x.lng,0)/items.length;const selected=items.some(x=>state.selectedIds.has(x.item.id));const icon=L.divIcon({className:'commercial-map-marker-shell',html:`<button class="commercial-map-cluster${selected?' is-bulk-selected':''}"><strong>${items.length}</strong><span>${esc(items[0].item.city)}</span></button>`,iconSize:[72,52],iconAnchor:[36,26]});L.marker([lat,lng],{icon}).on('click',()=>state.map.setView([lat,lng],13)).addTo(state.leadLayer);return;}
          const loc=items[0],stage=stageFor(loc.item.stageId),color=state.markerMode==='priority'?PRIORITY_COLOR[loc.item.priority]||'#64748b':safeColor(stage.color),selected=state.selectedKind==='lead'&&loc.item.id===state.selected,bulk=state.selectedIds.has(loc.item.id),late=isOverdue(loc.item);
          const icon=L.divIcon({className:'commercial-map-marker-shell',html:`<button class="commercial-map-marker${selected?' is-selected':''}${bulk?' is-bulk-selected':''}${loc.estimated?' is-estimated':''}" style="--marker-color:${color}" title="${esc(loc.estimated?'Posição aproximada':'Coordenada salva')}"><span>${esc(initials(loc.item.name))}</span>${late?'<i></i>':''}</button>`,iconSize:[46,50],iconAnchor:[23,46]});L.marker([loc.lat,loc.lng],{icon}).bindTooltip(`<div class="commercial-map-tooltip"><strong>${esc(loc.item.name)}</strong><span>${esc(loc.item.city||'Sem cidade')} · ${esc(stage.name)}</span></div>`,{direction:'top',offset:[0,-38],opacity:.96}).on('click',()=>{state.selected=loc.item.id;state.selectedKind='lead';drawAll(false)}).addTo(state.leadLayer);
        });
      }
      if(state.showProspects){state.mappedProspects.forEach(loc=>{const selected=state.selectedKind==='prospect'&&loc.item.id===state.selected;const icon=L.divIcon({className:'commercial-map-marker-shell',html:`<button class="commercial-map-prospect-marker${selected?' is-selected':''}" title="Prospect do Garimpo">◆</button>`,iconSize:[34,40],iconAnchor:[17,34]});L.marker([loc.lat,loc.lng],{icon}).on('click',()=>{state.selected=loc.item.id;state.selectedKind='prospect';state.tab='prospects';syncTabs();drawAll(false)}).addTo(state.prospectLayer)});}
      if(state.radiusCenter&&state.radiusKm>0)L.circle([state.radiusCenter.lat,state.radiusCenter.lng],{radius:state.radiusKm*1000,color:'#2563eb',weight:2,dashArray:'7 6',fillColor:'#2563eb',fillOpacity:.07}).addTo(state.radiusLayer);
      if(fit&&state.locations.length){const bounds=L.latLngBounds(state.locations.map(x=>[x.lat,x.lng]));state.map.fitBounds(bounds,{padding:[48,48],maxZoom:state.locations.length===1?14:12});}
    };
    const drawAll = fit => {applyFilters();renderSummary();renderLegend();drawSelected();renderSelection();renderList();renderUnmapped();renderMap(fit);};

    const fitAll = () => {
      if(state.ready&&state.map&&state.locations.length){const L=window.L;state.map.fitBounds(L.latLngBounds(state.locations.map(x=>[x.lat,x.lng])),{padding:[64,64],maxZoom:state.locations.length===1?15:13});return;}
      drawAll(true);
    };
    const toggleFullscreen = () => {
      state.expanded=!state.expanded;root.classList.toggle('is-map-expanded',state.expanded);
      const button=q('[data-fullscreen]');if(button)button.textContent=state.expanded?'Sair da tela cheia':'Tela cheia';
      setTimeout(()=>{state.map?.invalidateSize?.();if(state.expanded)fitAll();},220);
    };
    const BASEMAPS={
      light:{url:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',options:{maxZoom:20,subdomains:'abcd',attribution:'&copy; OpenStreetMap &copy; CARTO'}},
      streets:{url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',options:{maxZoom:19,attribution:'&copy; OpenStreetMap'}},
      dark:{url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',options:{maxZoom:20,subdomains:'abcd',attribution:'&copy; OpenStreetMap &copy; CARTO'}}
    };
    const applyBaseMap = key => {
      state.baseMap=BASEMAPS[key]?key:'light';qa('[data-basemap]').forEach(button=>button.classList.toggle('is-active',button.dataset.basemap===state.baseMap));
      if(!state.ready||!state.map)return;const L=window.L;if(state.baseLayer)state.map.removeLayer(state.baseLayer);const config=BASEMAPS[state.baseMap];state.baseLayer=L.tileLayer(config.url,config.options).addTo(state.map);state.baseLayer.bringToBack?.();
    };

    const applyRadius = () => {
      const loc=selectedLocation(); const km=Number(q('[data-radius]').value)||0;
      if(!loc||state.selectedKind!=='lead'){notify('Selecione primeiro um lead no mapa.');return;}
      if(!km){notify('Escolha uma distância de raio.');return;}
      state.radiusKm=km;state.radiusCenter={lat:loc.lat,lng:loc.lng,label:loc.item.name};q('[data-radius-clear]').hidden=false;drawAll(true);notify(`Raio de ${km} km aplicado a partir de ${loc.item.name}.`);
    };
    const clearRadius = () => {state.radiusKm=0;state.radiusCenter=null;q('[data-radius]').value='0';q('[data-radius-clear]').hidden=true;drawAll(true)};
    const selectVisible = () => {
      if(state.ready&&state.map){const bounds=state.map.getBounds();state.locations.forEach(loc=>{if(bounds.contains([loc.lat,loc.lng]))state.selectedIds.add(loc.item.id)});}else state.locations.forEach(loc=>state.selectedIds.add(loc.item.id));
      drawAll(false);notify(`${state.selectedIds.size} leads selecionados na área visível.`);
    };
    const setAreaMode = active => {
      state.areaMode=active;q('[data-area]').classList.toggle('is-active',active);q('[data-area]').textContent=active?'Arraste no mapa':'Selecionar área';
      if(state.ready&&state.map){active?state.map.dragging.disable():state.map.dragging.enable();state.map.getContainer().classList.toggle('is-area-selecting',active);}
      if(active)notify('Clique e arraste no mapa para selecionar uma área.');
    };

    qa('[data-filter]').forEach(input=>input.addEventListener(input.type==='checkbox'?'change':'input',()=>{
      const key=input.dataset.filter;state[key]=input.type==='checkbox'?input.checked:input.value;
      if(key==='heatMetric')state.heatMetric=input.value;
      if(key==='showProspects')state.showProspects=input.checked;
      drawAll(true);
    }));
    qa('[data-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view;qa('[data-view]').forEach(b=>b.classList.toggle('is-active',b===button));q('[data-heat-control]').hidden=state.view==='markers';drawAll(false)}));
    qa('[data-marker-mode]').forEach(button=>button.addEventListener('click',()=>{state.markerMode=button.dataset.markerMode;qa('[data-marker-mode]').forEach(b=>b.classList.toggle('is-active',b===button));drawAll(false)}));
    qa('[data-basemap]').forEach(button=>button.addEventListener('click',()=>applyBaseMap(button.dataset.basemap)));
    qa('[data-tab]').forEach(button=>button.addEventListener('click',()=>{state.tab=button.dataset.tab;syncTabs();renderList()}));
    q('.rt-clear-map-filters').addEventListener('click',()=>{state.search='';state.city='all';state.stage='all';state.owner='all';state.priority='all';state.geoStatus='all';state.overdue=false;['search','city','stage','owner','priority','geoStatus'].forEach(key=>q(`[data-filter="${key}"]`).value=key==='search'?'':'all');q('[data-filter="overdue"]').checked=false;clearRadius();});
    q('[data-radius-apply]').addEventListener('click',applyRadius);q('[data-radius-clear]').addEventListener('click',clearRadius);q('[data-visible]').addEventListener('click',selectVisible);q('[data-area]').addEventListener('click',()=>setAreaMode(!state.areaMode));
    q('[data-geocode-visible]').addEventListener('click',()=>void geocodeVisible());q('[data-map-diagnostics]').addEventListener('click',()=>void runDiagnostics());
    q('[data-location-queue]').addEventListener('click',()=>{state.tab='location';syncTabs();renderList()});
    q('[data-center]').addEventListener('click',()=>{const loc=selectedLocation();if(loc&&state.map)state.map.setView([loc.lat,loc.lng],15)});q('[data-fit-all]').addEventListener('click',fitAll);q('[data-fullscreen]').addEventListener('click',toggleFullscreen);
    const onDataUpdated=()=>{refreshBridgeLeads();drawAll(false)};
    window.addEventListener('realtalent-map-data-updated',onDataUpdated);window.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.expanded)toggleFullscreen()});

    const modeBadge=q('[data-map-mode]');if(modeBadge){const activeBridge=bridge();modeBadge.classList.toggle('is-demo',activeBridge?.mode!=='supabase');modeBadge.querySelector('span').textContent=activeBridge?.mode==='supabase'?'Mapa conectado':'Modo demonstração';}
    const precisionNote=q('[data-precision-note] span:last-child');
    if(precisionNote){const activeBridge=bridge();precisionNote.textContent=activeBridge?.mode==='supabase'?'Modo conectado: Google Geocoding, fila persistente, histórico e coordenadas salvas no Supabase.':'Modo demonstração: posições locais são estimativas e ficam identificadas como aproximadas.';}
    if(!canWrite()){q('[data-geocode-visible]').disabled=true;q('[data-geocode-visible]').title='Perfil somente leitura';}
    drawAll(false);
    const fallbackTimer=setTimeout(()=>{if(!state.ready)renderFallback()},2200);
    loadLeaflet().then(L=>{
      if(!root.isConnected)return;
      clearTimeout(fallbackTimer);const mapBox=q('[data-map]');mapBox.innerHTML='';state.fallback=false;
      const map=L.map(mapBox,{zoomControl:true,attributionControl:true,boxZoom:false,preferCanvas:true}).setView([-29.92,-51.18],10);
      state.map=map;state.ready=true;applyBaseMap(state.baseMap);state.leadLayer=L.layerGroup().addTo(map);state.heatLayer=L.layerGroup().addTo(map);state.prospectLayer=L.layerGroup().addTo(map);state.radiusLayer=L.layerGroup().addTo(map);state.selectionLayer=L.layerGroup().addTo(map);q('[data-map-state]')?.remove();
      map.on('zoomend',()=>renderMap(false));
      map.on('mousedown',event=>{if(!state.areaMode)return;state.areaStart=event.latlng;state.selectionLayer.clearLayers();state.rectangle=L.rectangle([event.latlng,event.latlng],{color:'#2563eb',weight:2,dashArray:'6 5',fillColor:'#2563eb',fillOpacity:.1}).addTo(state.selectionLayer)});
      map.on('mousemove',event=>{if(!state.areaMode||!state.areaStart||!state.rectangle)return;state.rectangle.setBounds(L.latLngBounds(state.areaStart,event.latlng))});
      map.on('mouseup',event=>{if(!state.areaMode||!state.areaStart)return;const bounds=L.latLngBounds(state.areaStart,event.latlng);state.locations.forEach(loc=>{if(bounds.contains([loc.lat,loc.lng]))state.selectedIds.add(loc.item.id)});state.areaStart=null;setAreaMode(false);drawAll(false);notify(`${state.selectedIds.size} leads selecionados pela área.`)});
      setTimeout(()=>{map.invalidateSize();renderMap(true)},120);
    }).catch(()=>{clearTimeout(fallbackTimer);renderFallback()});
  };

  const injectTransferBanner = () => {
    const workspace=storageGet('realtalent-crm-v100-active-workspace')||'local-demo';
    const page=document.querySelector('.prospecting-page'); if(!page||page.querySelector('.map-transfer-banner'))return;
    let context=null;try{context=JSON.parse(storageGet(`realtalent-map-prospecting-context:${workspace}`)||'null')}catch{context=null}
    if(!context?.leadIds?.length)return;
    const banner=document.createElement('section');banner.className='map-transfer-banner panel';banner.innerHTML=`<div><strong>Contexto recebido do Mapa de Leads</strong><span>${context.leadIds.length} leads em ${context.cities?.join(', ')||'região selecionada'}${context.radiusKm?` · raio de ${context.radiusKm} km`:''}</span></div><button type="button">Dispensar</button>`;banner.querySelector('button').addEventListener('click',()=>{storageRemove(`realtalent-map-prospecting-context:${workspace}`);banner.remove()});page.prepend(banner);
  };
  const scan = () => {document.querySelectorAll('#commercial-map-root').forEach(mount);injectTransferBanner()};
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',scan):scan();
})();
