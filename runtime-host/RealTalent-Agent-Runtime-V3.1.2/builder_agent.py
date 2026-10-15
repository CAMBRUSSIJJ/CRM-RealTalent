#!/usr/bin/env python3
import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

GATEWAY = os.environ.get('REALTALENT_AGENT_GATEWAY_URL', 'http://127.0.0.1:8791').rstrip('/')
CACHE_ROOT = Path(os.environ.get('XDG_CACHE_HOME', str(Path.home() / '.cache'))) / 'realtalent-agent' / 'builder'
ALLOWED_EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.json', '.md'}
BLOCKED_PARTS = {
    '.git', 'node_modules', 'supabase', 'migrations', 'migration', 'auth', 'security', 'permissions',
    'permission', 'rls', 'secrets', 'credentials', 'runtime', 'ops', 'dist', 'build', '.env'
}
BLOCKED_FILENAMES = {'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'vite.config.ts', 'vite.config.js'}
UNSAFE_NEW_PATTERNS = [
    r'node:child_process', r'from\s+["\']child_process["\']', r'\bexecSync\s*\(', r'\bexec\s*\(',
    r'\bspawn\s*\(', r'\beval\s*\(', r'new\s+Function\s*\(', r'OPENAI_API_KEY', r'\bsudo\b', r'rm\s+-rf',
]
STOPWORDS = {
    'para','como','isso','essa','esse','esta','este','uma','umas','uns','com','sem','que','dos','das','por','mais','menos',
    'quero','preciso','faça','faca','melhorar','corrigir','agora','parte','tela','deixar','funcionar','real','agent','realtalent',
    'blue','ocean','crm','the','and','with','from','this','that','into','make','fix','improve','screen','page','component'
}
TOKEN_ALIASES = {
    'contato': ['contact'], 'contatos': ['contact', 'contacts'], 'pessoa': ['person'], 'pessoas': ['person', 'people'],
    'empresa': ['company', 'account'], 'empresas': ['company', 'companies', 'account'], 'oportunidade': ['opportunity'],
    'oportunidades': ['opportunity', 'opportunities'], 'proposta': ['proposal'], 'propostas': ['proposal', 'proposals'],
    'tarefa': ['task'], 'tarefas': ['task', 'tasks'], 'equipe': ['team'], 'equipes': ['team', 'teams'],
    'meta': ['goal'], 'metas': ['goal', 'goals'], 'garimpo': ['prospect', 'prospecting'], 'prospecção': ['prospect', 'prospecting'],
    'ligação': ['call', 'calling'], 'ligações': ['call', 'calling'], 'agenda': ['calendar'], 'comunicação': ['communication'],
    'comunicações': ['communication', 'communications'], 'configuração': ['settings'], 'configurações': ['settings'],
    'jornada': ['journey'], 'jornadas': ['journey', 'journeys'], 'etapa': ['stage'], 'etapas': ['stage', 'stages'],
    'persona': ['persona'], 'personas': ['persona', 'personas'], 'problema': ['problem'], 'problemas': ['problem', 'problems'],
    'evidência': ['evidence'], 'evidências': ['evidence'], 'experimento': ['experiment'], 'experimentos': ['experiment'],
    'quadro': ['whiteboard'], 'blueprint': ['blueprint'], 'serviço': ['service'], 'serviços': ['service'],
    'barra': ['sidebar', 'bar'], 'lateral': ['sidebar'], 'cartão': ['card'], 'cartões': ['card', 'cards'], 'cards': ['card'],
    'botão': ['button'], 'botões': ['button', 'buttons'], 'filtro': ['filter'], 'filtros': ['filter', 'filters'],
    'layout': ['layout'], 'visual': ['visual', 'style', 'css'], 'estilo': ['style', 'css'], 'cor': ['color', 'css'],
    'login': ['login', 'auth'], 'dashboard': ['dashboard', 'home'], 'início': ['home'], 'home': ['home'],
}
EXPECTED_PACKAGES = {'crm': 'realtalent-crm', 'blue_ocean': 'blue-ocean-service-studio'}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def emit(kind, message, **extra):
    payload = {'type': kind, 'message': message, 'at': now_iso(), **extra}
    print('EVENT\t' + json.dumps(payload, ensure_ascii=False), flush=True)


def finish(payload):
    print('RESULT\t' + json.dumps(payload, ensure_ascii=False), flush=True)


def post_json(path, payload, timeout=75):
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(GATEWAY + path, data=data, headers={'content-type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode('utf-8'))
        except Exception:
            body = {'error': str(exc)}
        return exc.code, body


def get_json(path, timeout=20):
    req = urllib.request.Request(GATEWAY + path, method='GET')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode('utf-8'))
        except Exception:
            body = {'error': str(exc)}
        return exc.code, body


def validate_workspace(product, workspace):
    root = Path(workspace).expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f'Workspace não existe: {root}')
    package = root / 'package.json'
    if not package.is_file():
        raise ValueError('package.json não encontrado no workspace.')
    try:
        data = json.loads(package.read_text(encoding='utf-8'))
    except Exception as exc:
        raise ValueError(f'package.json inválido: {exc}')
    expected = EXPECTED_PACKAGES[product]
    if data.get('name') != expected:
        raise ValueError(f'Workspace rejeitado: package name={data.get("name")!r}, esperado={expected!r}.')
    if root == Path('/') or len(root.parts) < 3:
        raise ValueError('Workspace excessivamente amplo foi bloqueado.')
    return root, data


def relative_allowed(path, root):
    try:
        rel = path.resolve().relative_to(root)
    except Exception:
        return None
    if not rel.parts or rel.parts[0] != 'src':
        return None
    low_parts = {p.lower() for p in rel.parts}
    if low_parts & BLOCKED_PARTS:
        return None
    if rel.name.lower() in BLOCKED_FILENAMES:
        return None
    low_name = rel.name.lower()
    if '.test.' in low_name or '.spec.' in low_name:
        return None
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return None
    if path.is_symlink():
        return None
    return rel.as_posix()


def objective_tokens(text):
    raw = re.findall(r'[A-Za-zÀ-ÿ0-9_-]{3,}', text.lower())
    out = []
    for token in raw:
        token = token.strip('_-')
        aliases = TOKEN_ALIASES.get(token, [])
        if len(token) >= 4 and token not in STOPWORDS and token not in out:
            out.append(token)
        for alias in aliases:
            if alias not in out:
                out.append(alias)
    return out[:36]


def collect_candidates(root, objective, limit=10, max_file_bytes=120_000, total_chars=300_000):
    tokens = objective_tokens(objective)
    rows = []
    src = root / 'src'
    if not src.is_dir():
        return [], []
    for path in src.rglob('*'):
        if not path.is_file():
            continue
        rel = relative_allowed(path, root)
        if not rel:
            continue
        try:
            size = path.stat().st_size
            if size > max_file_bytes:
                continue
            text = path.read_text(encoding='utf-8')
        except Exception:
            continue
        low_path = rel.lower()
        low_text = text.lower()
        score = 0
        hits = []
        for token in tokens:
            p_hits = low_path.count(token)
            t_hits = min(8, low_text.count(token))
            if p_hits or t_hits:
                score += p_hits * 18 + t_hits * 3
                hits.append(token)
        # Favor central UI/service files even when user wording is broad.
        if any(k in low_path for k in ('assistant', 'agent', 'persona', 'journey', 'pipeline', 'contact', 'blueprint', 'workspace')):
            score += 1
        if score <= 0:
            continue
        rows.append((score, -len(text), rel, text, hits))
    rows.sort(reverse=True)
    selected, used = [], 0
    for score, _neg_len, rel, text, hits in rows:
        if len(selected) >= limit:
            break
        if used + len(text) > total_chars:
            continue
        selected.append({'path': rel, 'content': text, 'score': score, 'matched_terms': hits})
        used += len(text)
    return selected, tokens


def validate_plan(plan, candidate_map):
    if not isinstance(plan, dict):
        raise ValueError('Plano do modelo não é um objeto.')
    changes = plan.get('changes')
    if not isinstance(changes, list):
        raise ValueError('Plano sem changes[].')
    if len(changes) > 5:
        raise ValueError('Plano excede o limite de 5 arquivos.')
    normalized = []
    total_replacements = 0
    for change in changes:
        rel = str(change.get('path') or '')
        if rel not in candidate_map:
            raise ValueError(f'Arquivo fora do conjunto inspecionado/bloqueado: {rel}')
        reps = change.get('replacements')
        if not isinstance(reps, list) or not reps:
            raise ValueError(f'Arquivo {rel} sem replacements.')
        if len(reps) > 8:
            raise ValueError(f'Arquivo {rel} excede 8 substituições.')
        current = candidate_map[rel]
        new_text = current
        normalized_reps = []
        for rep in reps:
            old = str(rep.get('old') or '')
            new = str(rep.get('new') or '')
            expected = int(rep.get('expected_occurrences') or 0)
            if expected != 1:
                raise ValueError(f'{rel}: expected_occurrences deve ser exatamente 1.')
            if len(old) < 8:
                raise ValueError(f'{rel}: trecho old curto demais para substituição segura.')
            if old == new:
                raise ValueError(f'{rel}: substituição sem alteração.')
            count = new_text.count(old)
            if count != 1:
                raise ValueError(f'{rel}: trecho old ocorre {count}x; esperado 1x.')
            for pattern in UNSAFE_NEW_PATTERNS:
                if re.search(pattern, new, re.I):
                    raise ValueError(f'{rel}: conteúdo novo bloqueado pela política ({pattern}).')
            new_text = new_text.replace(old, new, 1)
            normalized_reps.append({'old': old, 'new': new, 'expected_occurrences': 1})
            total_replacements += 1
        normalized.append({'path': rel, 'purpose': str(change.get('purpose') or ''), 'replacements': normalized_reps, 'old_text': current, 'new_text': new_text})
    if total_replacements > 20:
        raise ValueError('Plano excede 20 substituições totais.')
    return normalized


def make_preview(root, normalized):
    parts = []
    for item in normalized:
        path = root / item['path']
        old = path.read_text(encoding='utf-8')
        diff = difflib.unified_diff(old.splitlines(), item['new_text'].splitlines(), fromfile='a/' + item['path'], tofile='b/' + item['path'], lineterm='', n=3)
        text = '\n'.join(diff)
        parts.append(text[:30_000])
    return '\n\n'.join(parts)[:90_000]


def create_validation_sandbox(root, job_dir, attempt):
    sandbox = job_dir / f'attempt-{attempt}' / 'sandbox'
    if sandbox.exists():
        shutil.rmtree(sandbox)
    ignored = shutil.ignore_patterns('.git', 'node_modules', 'dist', 'build', 'coverage', '.vite', '.cache', '.turbo')
    shutil.copytree(root, sandbox, symlinks=False, ignore=ignored)
    source_modules = root / 'node_modules'
    if source_modules.is_dir():
        try:
            (sandbox / 'node_modules').symlink_to(source_modules, target_is_directory=True)
        except OSError:
            # Fallback intentionally does not copy node_modules; run_gates will report NEEDS_USER.
            pass
    return sandbox


def apply_to_sandbox(sandbox, normalized):
    manifest = []
    for item in normalized:
        dst = sandbox / item['path']
        if not dst.is_file():
            raise ValueError(f'Arquivo não existe na sandbox: {item["path"]}')
        before = dst.read_text(encoding='utf-8')
        if before != item.get('old_text'):
            raise ValueError(f'Baseline da sandbox divergiu para {item["path"]}.')
        old_hash = hashlib.sha256(dst.read_bytes()).hexdigest()
        temp = dst.with_name(dst.name + '.realtalent-sandbox.tmp')
        temp.write_text(item['new_text'], encoding='utf-8')
        os.replace(temp, dst)
        manifest.append({'path': item['path'], 'old_sha256': old_hash, 'new_sha256': hashlib.sha256(dst.read_bytes()).hexdigest()})
    return manifest


def verify_promotion_baseline(root, normalized):
    for item in normalized:
        path = root / item['path']
        if not path.is_file() or path.read_text(encoding='utf-8') != item.get('old_text'):
            raise ValueError(f'Workspace mudou enquanto a sandbox era validada: {item["path"]}. Replaneje antes de promover.')


def backup_and_apply(root, normalized, job_dir, attempt):
    backup_dir = job_dir / f'attempt-{attempt}' / 'backup'
    backup_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for item in normalized:
        src = root / item['path']
        dst = backup_dir / item['path']
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        old_hash = hashlib.sha256(src.read_bytes()).hexdigest()
        temp = src.with_name(src.name + '.realtalent-agent.tmp')
        temp.write_text(item['new_text'], encoding='utf-8')
        os.replace(temp, src)
        new_hash = hashlib.sha256(src.read_bytes()).hexdigest()
        manifest.append({'path': item['path'], 'old_sha256': old_hash, 'new_sha256': new_hash})
    (job_dir / f'attempt-{attempt}' / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    return backup_dir, manifest


def rollback(root, backup_dir, manifest):
    restored = []
    for entry in manifest:
        rel = entry['path']
        src = backup_dir / rel
        dst = root / rel
        if src.is_file():
            shutil.copy2(src, dst)
            restored.append(rel)
    return restored


def scripts_for(product, package):
    scripts = package.get('scripts') or {}
    ordered = []
    wanted = ['syntax:audit', 'typecheck', 'test', 'build'] if product == 'crm' else ['syntax:check', 'typecheck', 'build']
    for name in wanted:
        if name in scripts:
            ordered.append(name)
    return ordered


def run_gates(root, product, package, timeout=180):
    if not (root / 'node_modules').is_dir():
        return {'status': 'NEEDS_USER', 'summary': 'node_modules ausente; gates foram bloqueados para evitar validar parcialmente.', 'gates': []}
    gate_results = []
    for name in scripts_for(product, package):
        emit('gate_start', f'Executando npm run {name}', gate=name)
        started = time.time()
        try:
            proc = subprocess.run(['npm', 'run', name], cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout, env={**os.environ, 'CI': '1'})
            output = (proc.stdout or '')[-20_000:]
            result = {'gate': name, 'ok': proc.returncode == 0, 'returncode': proc.returncode, 'duration_s': round(time.time()-started, 2), 'output': output}
        except subprocess.TimeoutExpired as exc:
            output = ((exc.stdout or '') if isinstance(exc.stdout, str) else '')[-20_000:]
            result = {'gate': name, 'ok': False, 'returncode': None, 'duration_s': round(time.time()-started, 2), 'output': output, 'timeout': True}
        gate_results.append(result)
        emit('gate_result', f"{name}: {'PASS' if result['ok'] else 'FAIL'}", gate=name, ok=result['ok'])
        if not result['ok']:
            return {'status': 'FAIL', 'summary': f'Gate {name} falhou.', 'gates': gate_results}
    return {'status': 'PASS', 'summary': 'Todos os gates obrigatórios passaram.', 'gates': gate_results}


def run_browser_qa(product, objective, timeout_s=100):
    base_url = 'http://127.0.0.1:4188/' if product == 'crm' else 'http://127.0.0.1:4173/'
    status, payload = post_json('/qa/run', {'product': product, 'base_url': base_url, 'objective': objective, 'mode': 'observe', 'max_steps': 10}, timeout=20)
    if status != 202 or not payload.get('job_id'):
        return {'status': 'UNAVAILABLE', 'summary': payload.get('error') or f'QA não iniciou (HTTP {status}).'}
    job_id = payload['job_id']
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        time.sleep(1)
        s, job = get_json('/qa/jobs/' + urllib.parse.quote(job_id), timeout=15)
        if s != 200:
            return {'status': 'UNAVAILABLE', 'summary': job.get('error') or f'Job QA HTTP {s}.'}
        if job.get('status') in ('completed', 'failed', 'cancelled'):
            result = job.get('result') or {}
            return {'status': result.get('status') or job.get('outcome') or job.get('status','UNKNOWN').upper(), 'summary': result.get('summary') or job.get('error') or '', 'evidence': result.get('evidence') or '', 'job_id': job_id}
    return {'status': 'UNKNOWN', 'summary': 'Browser QA excedeu o limite de espera.', 'job_id': job_id}


def feedback_from_gates(gates):
    parts = [gates.get('summary','')]
    for gate in gates.get('gates', []):
        if not gate.get('ok'):
            parts.append(f"Gate {gate.get('gate')} falhou:\n{gate.get('output','')[-8000:]}")
    return '\n\n'.join(parts)[-12_000:]


def builder_run(args):
    root, package = validate_workspace(args.product, args.workspace)
    job_id = args.job_id or ('builder_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
    job_dir = CACHE_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    report = {'jobId': job_id, 'product': args.product, 'workspace': str(root), 'objective': args.objective, 'apply': args.apply, 'status': 'UNKNOWN', 'attempts': [], 'startedAt': now_iso()}
    emit('start', f'Builder V1.9 iniciado em modo {"APPLY" if args.apply else "PLAN"}.', job_id=job_id)
    feedback = ''

    for attempt in range(1, args.max_iterations + 1):
        emit('inspect', f'Inspecionando arquivos candidatos (tentativa {attempt}/{args.max_iterations}).', attempt=attempt)
        candidates, tokens = collect_candidates(root, args.objective)
        if not candidates:
            report.update(status='NEEDS_USER', summary='Nenhum arquivo seguro em src/ foi localizado para o objetivo informado.', finishedAt=now_iso())
            finish(report); return 3
        candidate_map = {c['path']: c['content'] for c in candidates}
        safe_files = [{'path': c['path'], 'content': c['content'], 'matched_terms': c['matched_terms']} for c in candidates]
        request = {'product': args.product, 'objective': args.objective, 'attempt': attempt, 'feedback_from_previous_attempt': feedback, 'files': safe_files}
        emit('planning', f'Enviando {len(safe_files)} arquivos inspecionados para planejamento estruturado.', attempt=attempt, files=[c['path'] for c in candidates])
        status, payload = post_json('/builder/patch', request, timeout=90)
        if status != 200 or not payload.get('ok'):
            report.update(status='UNAVAILABLE', summary=payload.get('error') or f'Gateway Builder respondeu HTTP {status}.', finishedAt=now_iso())
            finish(report); return 2
        plan = payload.get('plan') or {}
        try:
            normalized = validate_plan(plan, candidate_map)
        except Exception as exc:
            report.update(status='BLOCKED', summary=f'Plano rejeitado pela política local: {exc}', plan=plan, finishedAt=now_iso())
            finish(report); return 4
        preview = make_preview(root, normalized)
        attempt_report = {'attempt': attempt, 'plan': plan, 'files': [x['path'] for x in normalized], 'preview': preview}
        report['attempts'].append(attempt_report)
        (job_dir / f'attempt-{attempt}-plan.json').write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding='utf-8')
        (job_dir / f'attempt-{attempt}-preview.diff').write_text(preview, encoding='utf-8')
        emit('plan_ready', plan.get('summary') or 'Plano pronto.', attempt=attempt, files=attempt_report['files'], risk=plan.get('risk'))
        if not normalized:
            report.update(status='NO_CHANGE', summary=plan.get('summary') or 'O modelo não propôs alteração.', finishedAt=now_iso())
            finish(report); return 0
        if not args.apply:
            report.update(status='PLAN_READY', summary=plan.get('summary') or 'Plano pronto para revisão.', plan=plan, preview=preview, artifactsDir=str(job_dir), finishedAt=now_iso())
            finish(report); return 0

        emit('sandbox', 'Criando sandbox isolada para validar o patch antes de tocar no workspace principal.', attempt=attempt)
        try:
            sandbox = create_validation_sandbox(root, job_dir, attempt)
            sandbox_manifest = apply_to_sandbox(sandbox, normalized)
        except Exception as exc:
            report.update(status='BLOCKED', summary=f'Não foi possível preparar a sandbox: {exc}', finishedAt=now_iso())
            finish(report); return 4
        attempt_report['sandbox'] = str(sandbox)
        attempt_report['sandboxManifest'] = sandbox_manifest
        gates = run_gates(sandbox, args.product, package, timeout=args.gate_timeout)
        attempt_report['gates'] = gates
        if gates['status'] == 'NEEDS_USER':
            report.update(status='NEEDS_USER', summary=gates['summary'] + ' Workspace principal permaneceu intacto.', finishedAt=now_iso())
            finish(report); return 3
        if gates['status'] != 'PASS':
            emit('sandbox_fail', 'Gates falharam dentro da sandbox; workspace principal não foi alterado.', attempt=attempt)
            feedback = feedback_from_gates(gates)
            if attempt < args.max_iterations:
                emit('retry', 'Auto-Recovery vai tentar uma correção adicional usando o erro real dos gates.', attempt=attempt+1)
                continue
            report.update(status='FAIL', summary=gates['summary'] + ' Sandbox descartada; baseline principal permaneceu intacta.', finishedAt=now_iso())
            finish(report); return 1

        try:
            verify_promotion_baseline(root, normalized)
            backup_dir, manifest = backup_and_apply(root, normalized, job_dir, attempt)
        except Exception as exc:
            report.update(status='NEEDS_USER', summary=f'Promoção bloqueada: {exc}', finishedAt=now_iso())
            finish(report); return 3
        attempt_report['manifest'] = manifest
        emit('promoted', f'{len(normalized)} arquivo(s) promovido(s) após gates PASS na sandbox, com backup transacional.', attempt=attempt)

        if not args.browser_qa:
            report.update(status='PASS', summary='Patch validado em sandbox, promovido e gates aprovados. Browser QA foi desativado.', plan=plan, artifactsDir=str(job_dir), finishedAt=now_iso())
            finish(report); return 0

        qa_objective = str(plan.get('qa_objective') or '').strip() or f'Verifique visualmente se a alteração “{args.objective}” está correta e se não há regressão visível.'
        emit('browser_qa', 'Gates passaram; iniciando verificação visual no navegador gerenciado.', attempt=attempt)
        qa = run_browser_qa(args.product, qa_objective)
        attempt_report['browserQa'] = qa
        emit('browser_qa_result', f"Browser QA: {qa.get('status')} — {qa.get('summary','')}", attempt=attempt)
        if qa.get('status') == 'PASS':
            report.update(status='PASS', summary='Patch validado em sandbox, promovido e Browser QA confirmou o resultado.', plan=plan, browserQa=qa, artifactsDir=str(job_dir), finishedAt=now_iso())
            finish(report); return 0
        if qa.get('status') == 'FAIL':
            restored = rollback(root, backup_dir, manifest)
            attempt_report['rolledBack'] = restored
            feedback = ('Browser QA falhou após os gates passarem.\nResumo: ' + qa.get('summary','') + '\nEvidência: ' + qa.get('evidence',''))[-12_000:]
            emit('rollback', 'Browser QA falhou; patch foi revertido antes de nova tentativa.', attempt=attempt)
            if attempt < args.max_iterations:
                continue
            report.update(status='FAIL', summary='Browser QA falhou após a promoção e a baseline principal foi restaurada.', browserQa=qa, finishedAt=now_iso())
            finish(report); return 1
        # NEEDS_USER/UNKNOWN/UNAVAILABLE: gates are authoritative enough to keep, but never call visual validation passed.
        report.update(status='PASS_CODE_QA_NEEDS_USER', summary='Patch validado em sandbox e promovido; verificação visual requer intervenção/ambiente disponível.', plan=plan, browserQa=qa, artifactsDir=str(job_dir), finishedAt=now_iso())
        finish(report); return 0

    report.update(status='FAIL', summary='Builder encerrou sem concluir.', finishedAt=now_iso())
    finish(report); return 1


def self_test():
    with tempfile.TemporaryDirectory(prefix='rt-builder-selftest-') as td:
        root = Path(td)
        (root / 'src').mkdir()
        (root / 'package.json').write_text(json.dumps({'name':'realtalent-crm','scripts':{}}), encoding='utf-8')
        target = root / 'src' / 'Example.tsx'
        target.write_text('export const Example = () => <button>Salvar</button>\n', encoding='utf-8')
        r, _ = validate_workspace('crm', root)
        assert r == root.resolve()
        assert relative_allowed(target, r) == 'src/Example.tsx'
        blocked = root / 'src' / 'auth' / 'secret.ts'; blocked.parent.mkdir(); blocked.write_text('x', encoding='utf-8')
        assert relative_allowed(blocked, r) is None
        plan = {'changes':[{'path':'src/Example.tsx','purpose':'teste','replacements':[{'old':'<button>Salvar</button>','new':'<button>Salvar agora</button>','expected_occurrences':1}]}]}
        norm = validate_plan(plan, {'src/Example.tsx':target.read_text(encoding='utf-8')})
        job = root / '.tmp'
        (root / 'node_modules').mkdir()
        sandbox = create_validation_sandbox(r, job, 1)
        sandbox_manifest = apply_to_sandbox(sandbox, norm)
        assert sandbox_manifest and 'Salvar agora' in (sandbox / 'src' / 'Example.tsx').read_text(encoding='utf-8')
        assert '<button>Salvar</button>' in target.read_text(encoding='utf-8')
        verify_promotion_baseline(r, norm)
        backup, manifest = backup_and_apply(r, norm, job, 1)
        assert 'Salvar agora' in target.read_text(encoding='utf-8')
        restored = rollback(r, backup, manifest)
        assert restored == ['src/Example.tsx'] and '<button>Salvar</button>' in target.read_text(encoding='utf-8')
        try:
            validate_plan({'changes':[{'path':'src/Example.tsx','purpose':'x','replacements':[{'old':'<button>Salvar</button>','new':'eval("x")','expected_occurrences':1}]}]}, {'src/Example.tsx':target.read_text(encoding='utf-8')})
            raise AssertionError('unsafe pattern deveria ser bloqueado')
        except ValueError:
            pass
    finish({'status':'PASS','summary':'Builder V1.9 sandbox isolation + promotion + rollback OK.'})
    return 0


def main():
    ap = argparse.ArgumentParser(description='RealTalent Builder + QA Agent V1.9')
    ap.add_argument('--product', choices=['crm','blue_ocean'], default='crm')
    ap.add_argument('--workspace', default='')
    ap.add_argument('--objective', default='')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--yes', action='store_true', help='Confirma aplicação sem prompt interativo; use apenas quando a confirmação ocorreu fora deste processo.')
    ap.add_argument('--max-iterations', type=int, default=2)
    ap.add_argument('--gate-timeout', type=int, default=180)
    ap.add_argument('--no-browser-qa', dest='browser_qa', action='store_false')
    ap.add_argument('--job-id', default='')
    ap.add_argument('--self-test', action='store_true')
    ap.set_defaults(browser_qa=True)
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    if not args.workspace or not args.objective.strip():
        ap.error('--workspace e --objective são obrigatórios.')
    args.max_iterations = max(1, min(3, args.max_iterations))
    args.gate_timeout = max(30, min(300, args.gate_timeout))
    if args.apply and not args.yes:
        print('\nO Builder vai validar o patch numa sandbox isolada, executar gates e só então promover arquivos src/** para o workspace principal.')
        print('Digite APLICAR para confirmar: ', end='', flush=True)
        if input().strip() != 'APLICAR':
            finish({'status':'CANCELLED','summary':'Aplicação cancelada pelo usuário.'}); return 0
    return builder_run(args)


if __name__ == '__main__':
    raise SystemExit(main())
