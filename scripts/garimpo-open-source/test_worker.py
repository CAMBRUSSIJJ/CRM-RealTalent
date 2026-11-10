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

    def test_entities_remain_ordinary_text(self):
        safe=mod.offline_html('<p>Pesquisa &amp; ensino &lt;serviços&gt;</p>')
        self.assertIn('Pesquisa &amp; ensino &lt;serviços&gt;',safe)

if __name__ == "__main__":
    unittest.main()
