#!/usr/bin/env python3
"""Offline HTML processor for RealTalent Garimpo; JSON on stdin/stdout.

URLs are never fetched here. The Node gateway verifies public HTTPS destinations,
pins DNS, limits response size and sends HTML only. Crawl4AI receives sanitized
raw HTML with JavaScript disabled. ScrapeGraphAI is optional and uses local Ollama.
"""
import asyncio
import contextlib
import html
from html.parser import HTMLParser
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile

MAX_INPUT = 450_000
MAX_HTML = 380_000
MAX_TEXT = 6500
ALLOWED = frozenset(("html", "head", "title", "body", "main", "article", "section",
                     "div", "span", "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
                     "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th",
                     "blockquote", "strong", "em", "b", "i", "a", "time"))
BLOCKED = frozenset(("script", "style", "svg", "iframe", "object", "embed", "form",
                     "noscript", "template"))
VOID = frozenset(("br",))

class OfflineHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chunks = []
        self.skip = []

    def handle_starttag(self, tag, attrs):
        if tag in BLOCKED:
            self.skip.append(tag)
        elif not self.skip and tag in ALLOWED:
            self.chunks.append("<" + tag + ">")

    def handle_startendtag(self, tag, attrs):
        if not self.skip and tag in VOID:
            self.chunks.append("<br>")

    def handle_endtag(self, tag):
        if self.skip:
            if tag == self.skip[-1]:
                self.skip.pop()
        elif tag in ALLOWED and tag not in VOID:
            self.chunks.append("</" + tag + ">")

    def handle_data(self, data):
        if not self.skip:
            self.chunks.append(html.escape(data))

    def handle_entityref(self, name):
        self.handle_data(html.unescape("&" + name + ";"))

def offline_html(raw):
    parser = OfflineHTML()
    parser.feed(raw)
    parser.close()
    return "<!doctype html><html><body>" + "".join(parser.chunks) + "</body></html>"

async def crawl_markdown(safe_html):
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    browser = BrowserConfig(headless=True, java_script_enabled=False,
                            text_mode=True, light_mode=True, avoid_css=True, verbose=False)
    run = CrawlerRunConfig(cache_mode=CacheMode.BYPASS,
                           word_count_threshold=0, process_iframes=False,
                           scan_full_page=False)
    async with AsyncWebCrawler(config=browser) as crawler:
        outcome = await crawler.arun(url="raw:" + safe_html, config=run)
        if not outcome.success:
            raise RuntimeError("crawl4ai_processing_failed")
        markdown = outcome.markdown
        content = getattr(markdown, "fit_markdown", None) or getattr(markdown, "raw_markdown", None) or str(markdown)
        return re.sub(r"\n{3,}", "\n\n", content).strip()[:MAX_TEXT]

def scrape_facts(safe_html):
    # This mode is deliberately opt-in: it may trigger a second Qwen inference.
    from scrapegraphai.graphs import SmartScraperGraph
    graph_config = {
        "llm": {
            "model": "ollama/" + os.getenv("REALTALENT_OLLAMA_MODEL", "qwen3:8b"),
            "base_url": "http://127.0.0.1:11434",
            "model_tokens": 8192,
            "format": "json",
        },
        "headless": True,
        "verbose": False,
    }
    with tempfile.TemporaryDirectory(prefix="realtalent-source-") as tmp:
        file_path = Path(tmp) / "source.html"
        file_path.write_text(safe_html, encoding="utf-8")
        graph = SmartScraperGraph(
            source=str(file_path),
            prompt=("Retorne JSON com a chave 'facts': até três fatos empresariais "
                    "EXPLÍCITOS nesta página. Para cada fato retorne 'fact' e "
                    "'quote' (trecho literal contínuo do texto). "
                    "Não invente eventos, datas ou sinais de compra. "
                    "Se não encontrar fatos, retorne {\"facts\": []}."),
            config=graph_config,
        )
        value = graph.run()
    return value.get("facts", []) if isinstance(value, dict) else []

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--health":
        print(json.dumps({
            "ok": True, "mode": "offline_only",
            "crawl4ai": importlib.util.find_spec("crawl4ai") is not None,
            "scrapegraphai": importlib.util.find_spec("scrapegraphai") is not None,
        }))
        return
    data = json.loads(sys.stdin.read(MAX_INPUT + 1))
    raw = data.get("html", "")
    if not isinstance(raw, str) or not raw or len(raw.encode("utf-8")) > MAX_HTML:
        print(json.dumps({"ok": False, "error": "invalid_html"}))
        return
    safe_html = offline_html(raw)
    # Suppress library diagnostics on stdout: the stdout protocol is exactly one JSON.
    with contextlib.redirect_stdout(sys.stderr):
        try:
            rendered = asyncio.run(crawl_markdown(safe_html))
        except Exception:
            print("Crawl4AI offline unavailable or failed", file=sys.stderr)
            rendered = ""
        facts = []
        if rendered and os.getenv("REALTALENT_GARIMPO_SCRAPEGRAPH") == "1":
            try:
                facts = scrape_facts(safe_html)
            except Exception:
                print("Optional ScrapeGraphAI local extraction unavailable", file=sys.stderr)
    print(json.dumps({
        "ok": len(rendered) >= 180,
        "text": rendered,
        "facts": facts if isinstance(facts, list) else [],
        "engine": "crawl4ai" if rendered else "unavailable",
    }, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"ok": False, "error": "invalid_request"}))
