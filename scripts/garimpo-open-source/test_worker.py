import importlib.util
from pathlib import Path
import unittest

FILE=Path(__file__).with_name("worker.py")
spec=importlib.util.spec_from_file_location("garimpo_open_source_worker",FILE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class OfflineHtmlTests(unittest.TestCase):
    def test_unsafe_attributes_scripts_and_resources_are_removed(self):
        raw=('<html><body><main onload="boom()"><h1>Escola Horizonte</h1>'
             '<script>fetch("http://127.0.0.1/secret")</script>'
             '<img src="https://tracker.example/pixel">'
             '<a href="http://localhost/admin">Nova unidade anunciada</a></main></body></html>')
        safe=mod.offline_html(raw)
        self.assertIn("Escola Horizonte",safe)
        self.assertIn("Nova unidade anunciada",safe)
        for forbidden in ("onload", "fetch(", "src=", "href=", "localhost", "<script", "<img"):
            self.assertNotIn(forbidden,safe)

    def test_navigation_chrome_is_removed_but_article_evidence_is_preserved(self):
        source=('<html><head><title>Portal da Escola</title></head><body>'
                '<header><a href="/">Entrar na secretaria</a></header>'
                '<nav><ul><li>Home</li><li>Menu de serviços</li></ul></nav>'
                '<aside><p>Compartilhe esta notícia</p></aside>'
                '<main><article><h1>Nova unidade em Rio Grande</h1>'
                '<p>Escola Horizonte anunciou uma nova unidade para o bairro.</p>'
                '</article></main><footer>Mapa do site e contato</footer></body></html>')
        safe=mod.offline_html(source)
        self.assertIn('Nova unidade em Rio Grande',safe)
        self.assertIn('Escola Horizonte anunciou uma nova unidade',safe)
        for nav_text in ('Entrar na secretaria','Menu de serviços','Compartilhe esta notícia',
                         'Mapa do site e contato'):
            self.assertNotIn(nav_text,safe)

    def test_nested_navigation_does_not_reintroduce_menu_text(self):
        source='<nav><div><nav>Menu interno</nav><span>Menu externo</span></div></nav><main>Notícia verificável</main>'
        safe=mod.offline_html(source)
        self.assertNotIn('Menu interno',safe)
        self.assertNotIn('Menu externo',safe)
        self.assertIn('Notícia verificável',safe)

    def test_entities_remain_ordinary_text(self):
        safe=mod.offline_html('<p>Pesquisa &amp; ensino &lt;serviços&gt;</p>')
        self.assertIn('Pesquisa &amp; ensino &lt;serviços&gt;',safe)

if __name__ == "__main__":
    unittest.main()
