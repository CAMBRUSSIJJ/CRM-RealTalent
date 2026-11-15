"""Build the credential-free G8 connector and its compatibility manifest."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
from io import BytesIO
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
BASE = '18f7ed2006f36a67cde1c7f52844187704842ea8'
REL = 'deploy/local-garimpo/'
PAYLOAD = [REL + name for name in ['bridge.mjs', 'hardware-profile.mjs', 'staged-research.mjs',
    'research-g6.mjs', 'lead-intelligence-g7.mjs', 'multichannel-g7.mjs',
    'intelligence-g8.mjs', 'intelligence-g8-check.mjs']]
PAYLOAD += ['supabase/functions/_shared/prospecting-ai.ts', 'supabase/functions/_shared/firecrawl-research.ts']

def original(name):
    result = subprocess.run(['git', 'show', BASE + ':' + name], cwd=ROOT, capture_output=True)
    return result.stdout if result.returncode == 0 else None

def digest(value):
    return hashlib.sha256(value).hexdigest() if value is not None else None

old_archive = original('public/downloads/Garimpo-Local.zip')
with ZipFile(BytesIO(old_archive)) as old:
    old_files = {name: old.read(name) for name in old.namelist() if not name.endswith('/')}
entries = []
for name in PAYLOAD:
    permitted = list(dict.fromkeys([digest(original(name)), digest(old_files.get(name))]))
    entries.append({'path': name, 'allowedBefore': permitted, 'after': digest((ROOT / name).read_bytes())})
manifest = {'version': 'G8', 'aiVersion': json.loads((ROOT / REL / 'package.json').read_text())['dependencies']['ai'], 'files': entries}
(ROOT / REL / 'update-g8-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
files = set(old_files) | set(PAYLOAD) | {REL + name for name in [
    'update-g8.mjs', 'update-g8-manifest.json', 'ATUALIZAR-GARIMPO-G8-LINUX.sh', 'G8-LEIA-ME.md',
    'research-g6-check.mjs', 'staged-research-check.mjs', 'lead-intelligence-g7-check.mjs', 'multichannel-g7-check.mjs']}
target = ROOT / 'public/downloads/Garimpo-Local.zip'
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for name in sorted(files):
        assert not name.endswith(('/garimpo.env', '/.env')), 'A private environment file cannot be packaged'
        source = ROOT / name
        content = source.read_bytes() if source.is_file() else old_files[name]
        info = ZipInfo(name, (2026, 11, 15, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = (0o100755 if name.endswith('.sh') else 0o100644) << 16
        archive.writestr(info, content)
with ZipFile(target) as archive:
    assert archive.testzip() is None
print(json.dumps({'file': str(target.relative_to(ROOT)), 'files': len(files), 'bytes': target.stat().st_size, 'sha256': digest(target.read_bytes())}))
