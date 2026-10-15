#!/usr/bin/env python3
import json, os, pathlib, subprocess, sys, urllib.parse, urllib.request, zipfile, re
BASE=os.environ.get('REALTALENT_AGENT_URL','http://127.0.0.1:8791').rstrip('/')

def req(method,path,payload=None):
    data=None if payload is None else json.dumps(payload,ensure_ascii=False).encode()
    r=urllib.request.Request(BASE+path,data=data,method=method,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(r,timeout=30) as x:return json.loads(x.read().decode())

def extract(path):
    p=pathlib.Path(path);ext=p.suffix.lower()
    if ext in {'.txt','.md','.markdown','.json','.jsonl','.csv','.tsv','.js','.mjs','.cjs','.jsx','.ts','.tsx','.css','.scss','.html','.htm','.xml','.sql','.py','.sh','.yaml','.yml'}:
        return p.read_text(errors='replace')
    if ext=='.docx':
        with zipfile.ZipFile(p) as z:
            xml=z.read('word/document.xml').decode('utf-8','replace')
        return re.sub(r'<[^>]+>',' ',xml).replace('&amp;','&').replace('&lt;','<').replace('&gt;','>')
    if ext=='.pdf':
        out=subprocess.run(['pdftotext','-layout',str(p),'-'],capture_output=True,text=True,timeout=60)
        if out.returncode: raise RuntimeError('pdftotext falhou. Instale poppler-utils ou converta o PDF para texto.')
        return out.stdout
    raise RuntimeError(f'Formato não suportado diretamente: {ext}. Use TXT/MD/JSON/CSV/código/DOCX ou PDF com pdftotext.')

def usage():
    print('''RealTalent Knowledge V2.4
Uso:
  knowledge-agent.py status
  knowledge-agent.py list [crm|blue_ocean|global]
  knowledge-agent.py search <crm|blue_ocean|global> <consulta>
  knowledge-agent.py add <crm|blue_ocean|global> <arquivo>
  knowledge-agent.py remove <document-id>
  knowledge-agent.py reset [crm|blue_ocean|global|all]
''')

def main():
    a=sys.argv[1:]
    if not a: return usage()
    cmd=a[0]
    if cmd=='status': out=req('GET','/knowledge/status')
    elif cmd=='list':
        product=a[1] if len(a)>1 else ''
        out=req('GET','/knowledge/documents'+(('?product='+urllib.parse.quote(product)) if product else ''))
    elif cmd=='search' and len(a)>=3:
        product=a[1];q=' '.join(a[2:]);out=req('GET','/knowledge/search?q='+urllib.parse.quote(q)+'&product='+urllib.parse.quote(product))
    elif cmd=='add' and len(a)>=3:
        product=a[1];p=pathlib.Path(a[2]).expanduser().resolve();text=extract(p);out=req('POST','/knowledge/documents',{'product':product,'title':p.name,'source':str(p),'text':text,'metadata':{'filename':p.name,'extension':p.suffix.lower()}})
    elif cmd=='remove' and len(a)>=2: out=req('DELETE','/knowledge/documents/'+urllib.parse.quote(a[1]))
    elif cmd=='reset':
        product=a[1] if len(a)>1 and a[1]!='all' else None;out=req('POST','/knowledge/reset',{'product':product})
    else: return usage()
    print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':
    try: main()
    except Exception as e: print(f'ERRO: {e}',file=sys.stderr);sys.exit(1)
