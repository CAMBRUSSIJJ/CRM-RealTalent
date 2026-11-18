"""Instalação reproduzível do coletor externo para Linux x86_64."""
import hashlib
import os
from pathlib import Path
import platform
import subprocess
from urllib.request import urlopen


VERSION="1.19.0"
SHA256="05e2bc1159e57f7b48a323169545997bb9671fe57d2df501a3be71d4429f1d2b"
URL=f"https://github.com/gosom/google-maps-scraper/releases/download/v{VERSION}/google_maps_scraper-{VERSION}-linux-amd64"
LICENSE="""MIT License

Copyright (c) 2023 Georgios Komninos

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""


def harden_browsers(cache: Path):
    # O coletor upstream passa opções que dispensam verificações do navegador.
    # Mantemos TLS e segurança de origem ativos e removemos a ocultação da automação.
    paths=list(cache.glob("chromium-*/chrome-linux*/chrome"))+list(cache.glob("chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell"))
    if not paths:
        raise ValueError("Chromium não encontrado após a instalação do coletor.")
    for browser in paths:
        original=browser.with_name(browser.name+".garimpo-real")
        if original.exists():
            continue
        browser.rename(original)
        browser.write_text('#!/usr/bin/env python3\nimport os,sys\npath=os.path.realpath(__file__)+".garimpo-real"\nblocked=("--ignore-certificate-errors","--disable-web-security","--disable-blink-features=AutomationControlled")\nargs=[arg for arg in sys.argv[1:] if not arg.startswith(blocked)]\nos.execv(path,[path,*args])\n')
        browser.chmod(0o755)


def verify_browser(cache: Path | None = None):
    """Fail at installation/startup, before advertising a worker that cannot launch Chromium."""
    cache = cache or Path(os.getenv('PLAYWRIGHT_BROWSERS_PATH', str(Path.home()/'.cache/ms-playwright')))
    paths = list(cache.glob('chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell')) or list(cache.glob('chromium-*/chrome-linux*/chrome'))
    if not paths:
        raise ValueError('Chromium ausente. Execute novamente o instalador do Garimpo.')
    try:
        result = subprocess.run([str(paths[0]), '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--dump-dom', 'about:blank'],
                                capture_output=True, timeout=20, check=False)
        if result.returncode != 0 or b'<html' not in result.stdout.lower():
            raise ValueError('Chromium não iniciou. Instale as bibliotecas Linux indicadas no guia antes de conectar o motor.')
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError('Não foi possível iniciar o Chromium. Confira as bibliotecas do navegador e execute o instalador novamente.') from exc


def setup_maps(directory: Path):
    if platform.system()!="Linux" or platform.machine() not in {"x86_64","amd64"}:
        raise ValueError("Este instalador atende Linux x86_64. Use a distribuição oficial gosom para outra plataforma.")
    directory.mkdir(parents=True,exist_ok=True)
    binary=(directory/f"google-maps-scraper-v{VERSION}").resolve()
    if not binary.exists() or hashlib.sha256(binary.read_bytes()).hexdigest()!=SHA256:
        temporary=binary.with_suffix(".download")
        try:
            digest=hashlib.sha256();size=0
            with urlopen(URL,timeout=60) as response, temporary.open("wb") as output:
                while block:=response.read(1024*1024):
                    size+=len(block)
                    if size>76_617_944: raise ValueError("Arquivo do coletor excedeu o tamanho esperado.")
                    digest.update(block);output.write(block)
            if size!=76_617_944 or digest.hexdigest()!=SHA256:
                raise ValueError("A verificação do coletor falhou; arquivo não executado.")
            temporary.chmod(0o755);temporary.replace(binary)
        finally:
            temporary.unlink(missing_ok=True)
    binary.chmod(0o755)
    (directory/"gosom-LICENSE.txt").write_text(LICENSE)
    env={key:value for key,value in os.environ.items() if key in {"PATH","HOME","LANG","XDG_CACHE_HOME","SSL_CERT_FILE","SSL_CERT_DIR","NODE_EXTRA_CA_CERTS","PLAYWRIGHT_BROWSERS_PATH","PLAYWRIGHT_DRIVER_PATH","HTTP_PROXY","HTTPS_PROXY","NO_PROXY","ALL_PROXY","http_proxy","https_proxy","no_proxy","all_proxy"}}
    env.update(DISABLE_TELEMETRY="1",PLAYWRIGHT_INSTALL_ONLY="1")
    try:
        subprocess.run([str(binary)],env=env,check=True,timeout=300)
    except (subprocess.CalledProcessError,subprocess.TimeoutExpired) as exc:
        raise ValueError("Não foi possível instalar o navegador do coletor. Confira acesso aos repositórios de pacotes e bibliotecas de sistema do Chromium.") from exc
    cache=Path(env.get("PLAYWRIGHT_BROWSERS_PATH",str(Path.home()/".cache/ms-playwright")))
    harden_browsers(cache)
    verify_browser(cache)
    return binary
