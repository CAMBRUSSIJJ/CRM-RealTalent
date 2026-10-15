#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, hashlib, json, os, shutil, sys, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

GATEWAY = os.environ.get('REALTALENT_AGENT_GATEWAY_URL', 'http://127.0.0.1:8791')
CACHE = Path(os.environ.get('XDG_CACHE_HOME', str(Path.home()/'.cache'))) / 'realtalent-agent' / 'qa'
HARD_BLOCK = [
    'excluir','remover','apagar','deletar','delete','pagar','comprar','checkout','enviar','send','publicar','publish',
    'convidar','invite','desconectar','disconnect','revogar','revoke','sair da conta','logout','alterar senha','reset password',
    'auth','rls','permissão','permission','sudo','instalar','install'
]
OBSERVE_BLOCK = HARD_BLOCK + ['salvar','save','criar','create','aplicar','apply','confirmar','confirm','executar','execute','mover','move','registrar','adicionar','add','atualizar','update']
SENSITIVE = ['senha','password','token','api key','apikey','chave','secret','segredo','cartão','card','cvv','otp','2fa','mfa','código de acesso','access code']
SEVERITY_WEIGHT = {'critical': 12, 'high': 7, 'medium': 3, 'low': 1}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def emit(kind, **payload):
    print('EVENT\t' + json.dumps({'type': kind, 'time': now_iso(), **payload}, ensure_ascii=False), flush=True)


def final(report):
    print('RESULT\t' + json.dumps(report, ensure_ascii=False), flush=True)


def loopback_url(value: str) -> bool:
    try:
        u = urllib.parse.urlparse(value)
        return u.scheme == 'http' and u.hostname in ('127.0.0.1','localhost')
    except Exception:
        return False


def same_origin(a: str, b: str) -> bool:
    try:
        x, y = urllib.parse.urlparse(a), urllib.parse.urlparse(b)
        return (x.scheme, x.hostname, x.port or 80) == (y.scheme, y.hostname, y.port or 80)
    except Exception:
        return False


def same_route(a: str, b: str) -> bool:
    try:
        x, y = urllib.parse.urlparse(a), urllib.parse.urlparse(b)
        return (x.scheme, x.hostname, x.port or 80, x.path, x.query) == (y.scheme, y.hostname, y.port or 80, y.path, y.query)
    except Exception:
        return False


def post_json(url: str, payload: dict, timeout=70):
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type':'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        try: parsed = json.loads(body)
        except Exception: parsed = {'error': body}
        return e.code, parsed


def browser_executable():
    env = os.environ.get('REALTALENT_AGENT_CHROMIUM')
    if env and Path(env).exists(): return env
    for name in ['chromium','chromium-browser','google-chrome','google-chrome-stable','chrome']:
        path = shutil.which(name)
        if path: return path
    return None


def safe_click_target(text: str, mode: str):
    low = (text or '').strip().lower()
    blockers = OBSERVE_BLOCK if mode == 'observe' else HARD_BLOCK
    return not any(token in low for token in blockers)


def safe_fill_target(target: str, value: str):
    low = f'{target} {value}'.lower()
    if any(token in low for token in SENSITIVE): return False
    if value.strip().startswith(('sk-','sk-proj-')): return False
    return True


def visible_text(page):
    try:
        return page.locator('body').inner_text(timeout=2500)[:18000]
    except Exception:
        return ''


def capture_screenshot(page, jpg_path: Path, png_path: Path):
    jpg = page.screenshot(path=str(jpg_path), type='jpeg', quality=72, full_page=False, animations='disabled')
    png = page.screenshot(path=str(png_path), type='png', full_page=False, animations='disabled')
    return {
        'base64': base64.b64encode(jpg).decode('ascii'),
        'sha256': hashlib.sha256(jpg).hexdigest(),
        'pngSha256': hashlib.sha256(png).hexdigest(),
        'jpgBytes': len(jpg), 'pngBytes': len(png),
    }


def accessibility_snapshot(page):
    """Compact AX tree via Chromium CDP. Never returns form values."""
    try:
        session = page.context.new_cdp_session(page)
        raw = session.send('Accessibility.getFullAXTree')
        nodes = []
        counts = {}
        unnamed_controls = []
        for node in raw.get('nodes', [])[:1200]:
            if node.get('ignored'): continue
            role = str((node.get('role') or {}).get('value') or '')
            name = str((node.get('name') or {}).get('value') or '')[:140]
            if role:
                counts[role] = counts.get(role, 0) + 1
            if role in {'button','link','textbox','combobox','checkbox','radio','switch','tab','menuitem'} and not name.strip():
                unnamed_controls.append({'role': role, 'backendDOMNodeId': node.get('backendDOMNodeId')})
            if role or name:
                nodes.append({'role': role, 'name': name})
            if len(nodes) >= 180: break
        try: session.detach()
        except Exception: pass
        return {
            'available': True,
            'roleCounts': dict(sorted(counts.items(), key=lambda x: (-x[1], x[0]))[:30]),
            'unnamedControls': unnamed_controls[:20],
            'sample': nodes[:100],
        }
    except Exception as exc:
        return {'available': False, 'error': repr(exc)[:280], 'roleCounts': {}, 'unnamedControls': [], 'sample': []}


def deep_visual_snapshot(page):
    """Deterministic visual/DOM/CSS diagnostics. It is evidence, not a vision-model assertion."""
    try:
        result = page.evaluate(r"""() => {
          const vw = window.innerWidth, vh = window.innerHeight;
          const body = document.body, de = document.documentElement;
          const all = [...document.querySelectorAll('body *')];
          const visible = el => { const cs=getComputedStyle(el), r=el.getBoundingClientRect(); return cs.display!=='none' && cs.visibility!=='hidden' && Number(cs.opacity||1)>0.01 && r.width>0 && r.height>0; };
          const label = el => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || el.tagName || '').trim().replace(/\s+/g,' ').slice(0,100);
          const role = el => el.getAttribute('role') || ({BUTTON:'button',A:'link',INPUT:'input',SELECT:'combobox',TEXTAREA:'textbox',IMG:'img'}[el.tagName]||'');
          const rect = el => { const r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right),bottom:Math.round(r.bottom)}; };
          const rgb = s => { const m=String(s||'').match(/rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i); return m?[+m[1],+m[2],+m[3]]:null; };
          const lum = c => { const x=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*x[0]+.7152*x[1]+.0722*x[2]; };
          const contrast=(a,b)=>{if(!a||!b)return null; const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)};
          const effectiveBg = el => { let p=el; while(p){const c=getComputedStyle(p).backgroundColor; if(c && !/rgba\([^)]*,\s*0\s*\)/.test(c) && c!=='transparent')return c;p=p.parentElement;} return 'rgb(255,255,255)'; };
          const issues=[]; const semantic=[];
          const add=(rule,severity,el,details={})=>issues.push({rule,severity,label:el?label(el):'',tag:el?.tagName||'',role:el?role(el):'',rect:el?rect(el):null,...details});
          const interactive = all.filter(el => ['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(el.tagName) || ['button','link','textbox','combobox','checkbox','radio','switch','tab','menuitem'].includes(el.getAttribute('role'))).filter(visible);
          const textEls = all.filter(el => visible(el) && (el.childElementCount===0 || ['P','SPAN','LABEL','BUTTON','A','TD','TH','LI'].includes(el.tagName)) && String(el.textContent||'').trim()).slice(0,900);
          const docW=Math.max(body?.scrollWidth||0,de?.scrollWidth||0), docH=Math.max(body?.scrollHeight||0,de?.scrollHeight||0);
          if(docW>vw+3) issues.push({rule:'horizontal-overflow',severity:'high',label:'document',tag:'DOCUMENT',role:'',rect:{x:0,y:0,w:docW,h:docH},overflowPx:docW-vw});
          for(const el of interactive.slice(0,650)){
            const r=el.getBoundingClientRect(), cs=getComputedStyle(el), l=label(el);
            if(r.width<24 || r.height<24) add('tiny-hit-target','medium',el,{width:Math.round(r.width),height:Math.round(r.height)});
            if(r.right<0 || r.bottom<0 || r.left>vw || r.top>vh) add('offscreen-interactive','medium',el);
            const parent=el.parentElement;if(parent){const pr=parent.getBoundingClientRect(),pcs=getComputedStyle(parent);if((pcs.overflow==='hidden'||pcs.overflowX==='hidden'||pcs.overflowY==='hidden')&&(r.right>pr.right+2||r.bottom>pr.bottom+2||r.left<pr.left-2||r.top<pr.top-2))add('clipped-interactive','high',el);}
            const nativeName = el.getAttribute('aria-label') || el.getAttribute('title') || (el.tagName==='INPUT' ? (el.labels?.[0]?.textContent||el.getAttribute('placeholder')) : l);
            if(!String(nativeName||'').trim()) add('unnamed-control','high',el);
            if(el.tagName==='IMG' && !el.getAttribute('alt')) add('image-missing-alt','medium',el);
            if(semantic.length<180) semantic.push({tag:el.tagName,role:role(el),name:l,rect:rect(el),display:cs.display,position:cs.position,zIndex:cs.zIndex,fontSize:cs.fontSize,fontWeight:cs.fontWeight,overflow:cs.overflow});
          }
          for(const el of textEls){
            const cs=getComputedStyle(el), txt=String(el.textContent||'').trim();
            const clippedX=el.scrollWidth>el.clientWidth+2, clippedY=el.scrollHeight>el.clientHeight+2;
            const hides=cs.overflow==='hidden'||cs.overflowX==='hidden'||cs.overflowY==='hidden'||cs.textOverflow==='ellipsis';
            if((clippedX||clippedY)&&hides) add('text-clipped','medium',el,{text:txt.slice(0,120),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight});
            const fg=rgb(cs.color), bg=rgb(effectiveBg(el)); const ratio=contrast(fg,bg); const fs=parseFloat(cs.fontSize||'16'), bold=parseInt(cs.fontWeight||'400',10)>=700;
            const large=fs>=24 || (fs>=18.66 && bold); const min=large?3:4.5;
            if(ratio!=null && ratio<min && txt.length>0) add('low-contrast-text', ratio<2?'high':'medium', el,{contrast:Number(ratio.toFixed(2)),required:min,text:txt.slice(0,100)});
          }
          const ids={}; for(const el of all){if(el.id){ids[el.id]=(ids[el.id]||0)+1;}} for(const [id,count] of Object.entries(ids)){if(count>1)issues.push({rule:'duplicate-id',severity:'medium',label:id,tag:'DOM',role:'',rect:null,count});}
          // Detect only meaningful overlap between distinct, visible interactive controls, excluding ancestor relations.
          const candidates=interactive.filter(el=>{const r=el.getBoundingClientRect();return r.bottom>0&&r.right>0&&r.top<vh&&r.left<vw}).slice(0,160);
          for(let i=0;i<candidates.length;i++){for(let j=i+1;j<candidates.length;j++){const a=candidates[i],b=candidates[j];if(a.contains(b)||b.contains(a))continue;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();const iw=Math.max(0,Math.min(ar.right,br.right)-Math.max(ar.left,br.left)),ih=Math.max(0,Math.min(ar.bottom,br.bottom)-Math.max(ar.top,br.top));const area=iw*ih;if(area>36){const minArea=Math.max(1,Math.min(ar.width*ar.height,br.width*br.height));if(area/minArea>.25)add('overlapping-controls','high',a,{with:label(b),overlapRatio:Number((area/minArea).toFixed(2))});}if(issues.filter(x=>x.rule==='overlapping-controls').length>=8)break;}if(issues.filter(x=>x.rule==='overlapping-controls').length>=8)break;}
          const severityCounts={critical:0,high:0,medium:0,low:0}; for(const i of issues){severityCounts[i.severity]=(severityCounts[i.severity]||0)+1;}
          const score=Math.min(100, issues.reduce((s,i)=>s+({critical:12,high:7,medium:3,low:1}[i.severity]||1),0));
          return {
            viewport:{width:vw,height:vh},document:{width:docW,height:docH},horizontalOverflow:docW>vw+3,
            interactiveCount:interactive.length,semanticElements:semantic,
            issues:issues.slice(0,90),severityCounts,issueScore:score,
            ruleCounts:issues.reduce((m,i)=>(m[i.rule]=(m[i.rule]||0)+1,m),{}),
            meta:{title:document.title||'',lang:document.documentElement.lang||'',activeElement:label(document.activeElement||document.body),url:location.href}
          };
        }""")
        result['accessibility'] = accessibility_snapshot(page)
        # AX unnamed controls are deterministic evidence too, but dedupe against DOM rule.
        existing = {(i.get('rule'), i.get('label')) for i in result.get('issues', [])}
        for item in result['accessibility'].get('unnamedControls', [])[:12]:
            key=('unnamed-control-ax', f"{item.get('role','control')}")
            if key not in existing and len(result['issues']) < 100:
                result['issues'].append({'rule':'unnamed-control-ax','severity':'high','label':item.get('role','control'),'tag':'AX','role':item.get('role',''),'rect':None})
        # Recompute counts if AX added anything.
        counts={'critical':0,'high':0,'medium':0,'low':0}
        for issue in result.get('issues',[]): counts[issue.get('severity','low')] = counts.get(issue.get('severity','low'),0)+1
        result['severityCounts']=counts
        result['issueScore']=min(100,sum(SEVERITY_WEIGHT.get(i.get('severity','low'),1) for i in result.get('issues',[])))
        return result
    except Exception as exc:
        return {'error': repr(exc)[:400], 'issues': [], 'severityCounts': {}, 'issueScore': 0, 'accessibility': {'available':False}}


def compact_visual_for_model(snapshot):
    return {
        'viewport': snapshot.get('viewport'), 'document': snapshot.get('document'),
        'horizontalOverflow': snapshot.get('horizontalOverflow'), 'interactiveCount': snapshot.get('interactiveCount'),
        'severityCounts': snapshot.get('severityCounts'), 'issueScore': snapshot.get('issueScore'), 'ruleCounts': snapshot.get('ruleCounts'),
        'issues': (snapshot.get('issues') or [])[:45],
        'accessibility': {
            'available': snapshot.get('accessibility',{}).get('available'),
            'roleCounts': snapshot.get('accessibility',{}).get('roleCounts',{}),
            'unnamedControls': snapshot.get('accessibility',{}).get('unnamedControls',[])[:12],
        },
        'semanticElements': (snapshot.get('semanticElements') or [])[:90],
        'meta': snapshot.get('meta',{}),
    }


def image_diff_metrics(before_path: Path, after_path: Path, diff_path: Path | None = None):
    try:
        from PIL import Image, ImageChops, ImageEnhance
        before=Image.open(before_path).convert('RGB'); after=Image.open(after_path).convert('RGB')
        if before.size != after.size:
            return {'available':True,'comparable':False,'reason':'viewport-size-changed','beforeSize':before.size,'afterSize':after.size}
        diff=ImageChops.difference(before,after)
        hist=diff.histogram(); total=before.size[0]*before.size[1]*3
        mean=sum((i%256)*count for i,count in enumerate(hist))/max(1,total)
        gray=diff.convert('L'); hist_gray=gray.histogram(); threshold=14
        changed=sum(hist_gray[threshold+1:]); total_pixels=max(1,before.size[0]*before.size[1]); changed_pct=round(changed/total_pixels*100,3)
        bbox=diff.getbbox()
        if diff_path:
            enhanced=ImageEnhance.Contrast(diff).enhance(3.0)
            enhanced.save(diff_path)
        return {'available':True,'comparable':True,'meanAbsoluteDifference':round(mean,3),'changedPixels':changed,'changedPercent':changed_pct,'boundingBox':bbox}
    except Exception as exc:
        return {'available':False,'comparable':False,'reason':repr(exc)[:260]}


def visual_compare(first, last, first_png: Path, last_png: Path, diff_path: Path):
    comparable_route = same_route(first.get('url',''), last.get('url',''))
    pixel = image_diff_metrics(first_png,last_png,diff_path)
    before = first.get('visualIntelligence') or {}; after = last.get('visualIntelligence') or {}
    bc=before.get('severityCounts') or {}; ac=after.get('severityCounts') or {}
    before_score=int(before.get('issueScore') or 0); after_score=int(after.get('issueScore') or 0)
    rules_before=before.get('ruleCounts') or {}; rules_after=after.get('ruleCounts') or {}
    all_rules=sorted(set(rules_before)|set(rules_after))
    rule_delta={r:int(rules_after.get(r,0))-int(rules_before.get(r,0)) for r in all_rules if int(rules_after.get(r,0))-int(rules_before.get(r,0)) != 0}
    return {
        'comparable': bool(comparable_route and pixel.get('comparable')),
        'sameRoute': comparable_route,
        'beforeUrl': first.get('url'), 'afterUrl': last.get('url'),
        'issueScore': {'before':before_score,'after':after_score,'delta':after_score-before_score},
        'severityDelta': {k:int(ac.get(k,0))-int(bc.get(k,0)) for k in ('critical','high','medium','low')},
        'ruleDelta': rule_delta,
        'pixelDiff': pixel,
        'interpretation': 'improved' if after_score < before_score else ('regressed' if after_score > before_score else 'unchanged-structural-score'),
        'note': 'Comparação visual só é conclusiva quando a rota/viewport são comparáveis; pixel diff indica mudança, não qualidade por si só.'
    }


def write_evidence_bundle(out_dir: Path, report: dict):
    report_path=out_dir/'report.json'; report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    manifest={'version':'1.9','generatedAt':now_iso(),'jobId':report.get('jobId'),'files':[]}
    for file in sorted(out_dir.iterdir()):
        if not file.is_file(): continue
        try:
            data=file.read_bytes(); manifest['files'].append({'name':file.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        except Exception: pass
    manifest_path=out_dir/'evidence-manifest.json'; manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    return {'report':str(report_path),'manifest':str(manifest_path),'files':manifest['files']}


def ensure_safe_pages(context, page, base_url, policy_events):
    for p in list(context.pages):
        try:
            url = p.url
            if url and url != 'about:blank' and not same_origin(url, base_url):
                policy_events.append(f'Navegação externa bloqueada: {url}')
                if p is page:
                    try: p.go_back(wait_until='domcontentloaded', timeout=7000)
                    except Exception: p.goto(base_url, wait_until='domcontentloaded', timeout=10000)
                else:
                    try: p.close()
                    except Exception: pass
        except Exception: pass


def execute_action(page, action, mode, base_url):
    t = action.get('type','none'); target = str(action.get('target','')); value = str(action.get('value','')); exact = bool(action.get('exact', False))
    if t == 'none': return 'nenhuma ação'
    if t in ('click_text','click_role') and not safe_click_target(target, mode): raise PermissionError(f'Ação bloqueada pela política ({mode}): clique em “{target}”.')
    if t in ('fill_label','fill_placeholder'):
        if mode == 'observe': raise PermissionError('Preenchimento bloqueado no modo observe.')
        if not safe_fill_target(target, value): raise PermissionError('Campo/valor sensível bloqueado pela política.')
    if t == 'click_text': page.get_by_text(target, exact=exact).first.click(timeout=7000); return f'click_text: {target}'
    if t == 'click_role':
        role = str(action.get('role') or 'button'); page.get_by_role(role, name=target, exact=exact).first.click(timeout=7000); return f'click_role {role}: {target}'
    if t == 'fill_label': page.get_by_label(target, exact=exact).first.fill(value, timeout=7000); return f'fill_label: {target}'
    if t == 'fill_placeholder': page.get_by_placeholder(target, exact=exact).first.fill(value, timeout=7000); return f'fill_placeholder: {target}'
    if t == 'press':
        key = value or target
        if key.lower() in ('control+alt+delete','meta+q','alt+f4'): raise PermissionError('Atalho bloqueado.')
        page.keyboard.press(key); return f'press: {key}'
    if t == 'goto_path':
        route = target or value
        if not route.startswith('/') or route.startswith('//'): raise PermissionError('goto_path deve permanecer no app local.')
        dest = urllib.parse.urljoin(base_url, route)
        if not same_origin(dest, base_url): raise PermissionError('Navegação fora da origem bloqueada.')
        page.goto(dest, wait_until='domcontentloaded', timeout=15000); return f'goto_path: {route}'
    if t == 'scroll':
        amount=max(-1200,min(1200,int(action.get('amount') or 600))); page.mouse.wheel(0,amount); return f'scroll: {amount}'
    if t == 'wait':
        ms=max(100,min(2500,int(action.get('milliseconds') or 700))); page.wait_for_timeout(ms); return f'wait: {ms}ms'
    raise ValueError(f'Ação desconhecida: {t}')


def finish_report(report, out_dir, status, summary='', evidence='', confidence=None):
    report['status']=status; report['summary']=summary or report.get('summary',''); report['evidence']=evidence or report.get('evidence','')
    if confidence is not None: report['confidence']=confidence
    steps=report.get('steps') or []
    if steps:
        first,last=steps[0],steps[-1]
        diff_path=out_dir/'before-after-diff.png'
        report['beforeAfter']=visual_compare(first,last,Path(first['screenshotPng']),Path(last['screenshotPng']),diff_path)
        report['visualIntelligence']={
            'baseline': {'url':first.get('url'),'issueScore':first.get('visualIntelligence',{}).get('issueScore'),'severityCounts':first.get('visualIntelligence',{}).get('severityCounts'),'ruleCounts':first.get('visualIntelligence',{}).get('ruleCounts')},
            'final': {'url':last.get('url'),'issueScore':last.get('visualIntelligence',{}).get('issueScore'),'severityCounts':last.get('visualIntelligence',{}).get('severityCounts'),'ruleCounts':last.get('visualIntelligence',{}).get('ruleCounts')},
            'comparison': report['beforeAfter'],
            'method':'deterministic DOM/CSS/AX + screenshot evidence; optional vision model only augments interpretation',
        }
    report['evidenceBundle']=write_evidence_bundle(out_dir,report)
    final(report)


def qa_run(args):
    if not loopback_url(args.base_url): raise SystemExit('Browser QA aceita somente HTTP local em 127.0.0.1/localhost.')
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        final({'status':'UNAVAILABLE','summary':f'Playwright Python indisponível: {exc}','product':args.product,'objective':args.objective,'steps':[]}); return 2
    job_id=args.job_id or ('qa_'+datetime.now().strftime('%Y%m%d_%H%M%S')); out_dir=CACHE/job_id; out_dir.mkdir(parents=True,exist_ok=True)
    console_errors=[]; network_failures=[]; http_failures=[]; policy_events=[]; steps=[]
    report={'jobId':job_id,'product':args.product,'objective':args.objective,'baseUrl':args.base_url,'mode':args.mode,'status':'UNKNOWN','summary':'','steps':steps,'consoleErrors':console_errors,'networkFailures':network_failures,'httpFailures':http_failures,'policyEvents':policy_events,'artifactsDir':str(out_dir),'qaEngine':'V1.9-deep-visual-verification'}
    emit('start',step=0,message=f'Conectando ao navegador gerenciado ({args.product}) com Deep Visual Intelligence.')
    try:
        with sync_playwright() as p:
            try: browser=p.chromium.connect_over_cdp(args.cdp_url,timeout=8000)
            except Exception as exc:
                finish_report(report,out_dir,'NEEDS_USER',f'Navegador gerenciado indisponível em {args.cdp_url}. Abra o produto pelo launcher V1.9 antes do QA. Detalhe: {exc}'); return 3
            if not browser.contexts:
                finish_report(report,out_dir,'NEEDS_USER','Sessão Chromium gerenciada não possui contexto ativo.'); return 3
            context=browser.contexts[0]; page=next((pg for pg in context.pages if same_origin(pg.url,args.base_url)),None)
            if page is None: page=context.new_page(); page.goto(args.base_url,wait_until='domcontentloaded',timeout=15000)
            try: page.bring_to_front()
            except Exception: pass
            page.on('console',lambda msg: console_errors.append(msg.text[:500]) if msg.type=='error' and len(console_errors)<100 else None)
            page.on('pageerror',lambda exc: console_errors.append(str(exc)[:500]) if len(console_errors)<100 else None)
            page.on('requestfailed',lambda req: network_failures.append(f'{req.method} {req.url} :: {req.failure}') if len(network_failures)<100 else None)
            page.on('response',lambda resp: http_failures.append(f'{resp.status} {resp.request.method} {resp.url}') if resp.status>=400 and same_origin(resp.url,args.base_url) and len(http_failures)<100 else None)
            history=[]; previous_hash=None
            for step in range(1,args.max_steps+1):
                ensure_safe_pages(context,page,args.base_url,policy_events)
                jpg=out_dir/f'step-{step:02d}.jpg'; png=out_dir/f'step-{step:02d}.png'; shot=capture_screenshot(page,jpg,png)
                text=visible_text(page); visual=deep_visual_snapshot(page); visual_change=None if previous_hash is None else shot['sha256']!=previous_hash; previous_hash=shot['sha256']
                emit('observe',step=step,message=f'Captura {step}: {page.url}',issue_score=visual.get('issueScore',0),high_issues=(visual.get('severityCounts') or {}).get('high',0),horizontal_overflow=bool(visual.get('horizontalOverflow')))
                status,payload=post_json(GATEWAY+'/browser/step',{
                    'product':args.product,'objective':args.objective,'mode':args.mode,'url':page.url,'step':step,
                    'visible_text':text,'screenshot_base64':shot['base64'],'screenshot_sha256':shot['sha256'],'visual_change':visual_change,
                    'layout_diagnostics':{'viewport':visual.get('viewport'),'document':visual.get('document'),'horizontalOverflow':visual.get('horizontalOverflow'),'interactiveCount':visual.get('interactiveCount')},
                    'visual_intelligence':compact_visual_for_model(visual),
                    'console_errors':console_errors[-20:],'network_failures':network_failures[-20:],'http_failures':http_failures[-20:],'history':history[-10:]
                },timeout=130)
                if status!=200 or not payload.get('ok'):
                    finish_report(report,out_dir,'UNAVAILABLE',payload.get('error') or f'Gateway Browser QA respondeu HTTP {status}.'); return 2
                decision={k:payload.get(k) for k in ('status','summary','evidence','confidence','action')}
                record={'step':step,'url':page.url,'decision':decision,'screenshot':str(jpg),'screenshotPng':str(png),'screenshotSha256':shot['sha256'],'screenshotPngSha256':shot['pngSha256'],'visualChange':visual_change,'layoutDiagnostics':{'viewport':visual.get('viewport'),'document':visual.get('document'),'horizontalOverflow':visual.get('horizontalOverflow')},'visualIntelligence':visual}
                steps.append(record); emit('decision',step=step,message=f"{decision.get('status')}: {decision.get('summary')}")
                if decision.get('status') in ('passed','failed','needs_user'):
                    mapped={'passed':'PASS','failed':'FAIL','needs_user':'NEEDS_USER'}[decision['status']]
                    finish_report(report,out_dir,mapped,decision.get('summary') or '',decision.get('evidence') or '',decision.get('confidence'))
                    return 0 if mapped=='PASS' else (3 if mapped=='NEEDS_USER' else 1)
                try:
                    action_desc=execute_action(page,decision.get('action') or {},args.mode,args.base_url); record['executed']=action_desc; emit('action',step=step,message=action_desc)
                except PermissionError as exc:
                    policy_events.append(str(exc)); history.append({'step':step,'blocked':str(exc),'decision':decision}); emit('blocked',step=step,message=str(exc)); continue
                except Exception as exc:
                    record['executionError']=repr(exc); history.append({'step':step,'error':repr(exc),'decision':decision}); emit('action_error',step=step,message=repr(exc)); page.wait_for_timeout(400); continue
                page.wait_for_timeout(500); ensure_safe_pages(context,page,args.base_url,policy_events)
                history.append({'step':step,'url':page.url,'action':decision.get('action'),'summary':decision.get('summary'),'evidence':decision.get('evidence'),'issueScore':visual.get('issueScore')})
            finish_report(report,out_dir,'UNKNOWN',f'Limite de {args.max_steps} passos atingido sem evidência suficiente para PASS/FAIL.'); return 4
    except Exception as exc:
        finish_report(report,out_dir,'FAIL',f'Falha do Browser QA: {exc!r}'); return 1


def self_test(deep=False):
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        final({'status':'UNAVAILABLE','summary':f'Playwright indisponível: {exc}'}); return 2
    exe=browser_executable()
    html="""<!doctype html><meta charset='utf-8'><title>RT QA Self Test</title><style>
    body{font-family:Arial;background:#fff;color:#111;margin:0;padding:20px}.clip{width:72px;overflow:hidden;white-space:nowrap}.badcontrast{color:#aaa;background:#fff}.tiny{width:18px;height:18px;padding:0}.wide{width:140vw}.over{position:absolute;left:20px;top:140px}.over2{position:absolute;left:25px;top:145px}</style>
    <button aria-label='Pipeline'>Pipeline</button><section hidden id='d'>Oportunidade QA visivel</section>
    <div id='issues'><div class='clip'>Texto deliberadamente cortado para teste</div><p class='badcontrast'>Contraste ruim</p><button class='tiny' aria-label='Tiny'>T</button><button class='over'>Um</button><button class='over2'>Dois</button><div class='wide'>overflow</div><button></button></div>
    <script>document.querySelector('[aria-label=Pipeline]').onclick=()=>document.querySelector('#d').hidden=false</script>"""
    try:
        with sync_playwright() as p:
            kw={'headless':True};
            if exe: kw['executable_path']=exe
            browser=p.chromium.launch(**kw); page=browser.new_page(viewport={'width':900,'height':600}); page.set_content(html)
            page.get_by_role('button',name='Pipeline').click(); page.wait_for_timeout(80)
            ok_action=page.get_by_text('Oportunidade QA visivel',exact=True).is_visible()
            if not deep:
                browser.close(); report={'status':'PASS' if ok_action else 'FAIL','summary':'Playwright + Chromium + ação semântica OK.' if ok_action else 'Texto esperado não apareceu.','chromium':exe or 'playwright-bundled'}; final(report); return 0 if ok_action else 1
            before=deep_visual_snapshot(page); tmp=CACHE/'selftest-v18'; tmp.mkdir(parents=True,exist_ok=True); b=tmp/'before.png'; a=tmp/'after.png'; page.screenshot(path=str(b),type='png',animations='disabled')
            page.evaluate("""() => { const i=document.querySelector('#issues'); i.innerHTML='<p style="color:#111;background:#fff">Tela corrigida</p><button aria-label="Ação segura" style="width:44px;height:36px">OK</button>'; document.body.style.overflowX='hidden'; }""")
            page.wait_for_timeout(60); after=deep_visual_snapshot(page); page.screenshot(path=str(a),type='png',animations='disabled'); diff=image_diff_metrics(b,a,tmp/'diff.png'); browser.close()
            rules=before.get('ruleCounts') or {}; checks={
              'semantic_action':ok_action,
              'horizontal_overflow_detected':bool(before.get('horizontalOverflow')),
              'text_clipping_detected':rules.get('text-clipped',0)>=1,
              'low_contrast_detected':rules.get('low-contrast-text',0)>=1,
              'tiny_target_detected':rules.get('tiny-hit-target',0)>=1,
              'overlap_detected':rules.get('overlapping-controls',0)>=1,
              'issue_score_improved':int(after.get('issueScore',999)) < int(before.get('issueScore',0)),
              'pixel_diff_available':bool(diff.get('available') and diff.get('comparable') and diff.get('changedPercent',0)>0),
              'accessibility_available':bool(before.get('accessibility',{}).get('available')),
            }
            passed=sum(1 for v in checks.values() if v); total=len(checks); status='PASS' if passed==total else 'FAIL'
            final({'status':status,'summary':f'Deep Visual self-test {passed}/{total}.','checks':checks,'before':{'score':before.get('issueScore'),'rules':rules},'after':{'score':after.get('issueScore'),'rules':after.get('ruleCounts')},'pixelDiff':diff,'chromium':exe or 'playwright-bundled'}); return 0 if status=='PASS' else 1
    except Exception as exc:
        final({'status':'UNAVAILABLE','summary':repr(exc),'chromium':exe}); return 2


def main():
    ap=argparse.ArgumentParser(description='RealTalent Browser QA V1.9 — Deep Visual Verification')
    ap.add_argument('--product',choices=['crm','blue_ocean'],default='crm'); ap.add_argument('--base-url',default='http://127.0.0.1:4188/')
    ap.add_argument('--objective',default='Verifique se a aplicação está carregada sem erro visível.'); ap.add_argument('--mode',choices=['observe','sandbox'],default='observe')
    ap.add_argument('--max-steps',type=int,default=10); ap.add_argument('--cdp-url',default='http://127.0.0.1:9223'); ap.add_argument('--job-id',default='')
    ap.add_argument('--self-test',action='store_true'); ap.add_argument('--deep-self-test',action='store_true')
    args=ap.parse_args(); args.max_steps=max(2,min(15,args.max_steps))
    if args.deep_self_test: return self_test(True)
    if args.self_test: return self_test(False)
    return qa_run(args)

if __name__=='__main__': raise SystemExit(main())
