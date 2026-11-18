import unittest
from unittest.mock import patch

import httpx

from garimpo.extraction import WebsiteCollector, extract
from garimpo.models import Candidate
from support import Harness, pinned


class ExtractionTest(unittest.IsolatedAsyncioTestCase):
    def test_agency_schema_credit_links_and_hidden_samples_do_not_become_company_contacts(self):
        item = Candidate(provider_id="brave:1", company="Clínica Teste", website="https://empresa.test/")
        extract(item, '''<script type="application/ld+json">{"@graph":[
          {"@type":"Organization","name":"Agência","url":"https://agencia.test/","email":"agencia@agencia.test"},
          {"@type":"Dentist","name":"Clínica Teste","url":"https://empresa.test/","telephone":"51999991001"}]}</script>
          <div class="site-credits"><a href="mailto:dev@agencia.test">Desenvolvimento</a></div>
          <span hidden>sample@empresa.test</span>
          <footer><a href="mailto:comercial@empresa.test">Comercial</a></footer>
        ''', item.website)
        self.assertEqual(item.company, "Clínica Teste")
        self.assertEqual(item.email, "comercial@empresa.test")
        self.assertEqual(item.phone, "+5551999991001")
        self.assertIn("Dentist", item.schema_types)
        self.assertFalse(any("agencia" in e.value or "sample" in e.value for e in item.evidence))

    def test_ambiguous_businesses_in_separate_json_blocks_do_not_mix_contact_details(self):
        item = Candidate(provider_id="brave:1", company="Lista de clínicas")
        extract(item, '''<script type="application/ld+json">{"@type":"Dentist","name":"Clínica A","telephone":"51999991001"}</script>
          <script type="application/ld+json">{"@type":"Dentist","name":"Clínica B","email":"contato@clinica.test"}</script>
          <p>Contato: outro@clinica.test</p><a href="tel:51999991002">Telefone</a>
        ''', "https://lista.test/")
        self.assertEqual(item.phone, "")
        self.assertEqual(item.email, "")
        self.assertTrue(item.warnings)

    def test_nested_publisher_does_not_override_main_business(self):
        item = Candidate(provider_id="brave:1", company="Empresa Teste")
        extract(item, '''<script type="application/ld+json">{"@type":"Dentist","name":"Empresa Teste","telephone":"51999991001", "publisher":{"@type":"Organization","name":"Editora","email":"editora@terceiro.test"}}</script>''', "https://empresa.test/")
        self.assertEqual(item.phone, "+5551999991001")
        self.assertEqual(item.email, "")

    def test_developer_credit_anchor_is_ignored_without_special_css_class(self):
        item = Candidate(provider_id="osm:1", company="Empresa")
        extract(item, '<p>Contato: <a href="mailto:comercial@empresa.test">Comercial</a></p><p>Desenvolvido por <a href="mailto:dev@agencia.test">Agência</a></p>', "https://empresa.test/")
        self.assertEqual(item.email, "comercial@empresa.test")
        self.assertFalse(any("agencia" in e.value for e in item.evidence))

    def test_plain_text_credit_is_ignored_and_main_entity_precedes_miscellaneous_link(self):
        item = Candidate(provider_id="brave:1", company="Empresa Teste")
        extract(item, '''<a href="mailto:dpo@terceiro.test">Privacidade</a>
          <script type="application/ld+json">{"@type":"Dentist","name":"Empresa Teste","email":"comercial@empresa.test"}</script>
          <p>Desenvolvido por Agência dev@agencia.test</p>''', "https://empresa.test/")
        self.assertEqual(item.email, "comercial@empresa.test")
        self.assertFalse(any("agencia" in e.value for e in item.evidence))

    async def test_missing_deep_result_falls_back_to_homepage_within_page_budget(self):
        def website(request):
            if request.url.path in {"/robots.txt", "/antigo"}:
                return httpx.Response(404)
            return httpx.Response(200, text='<a href="tel:51999991001">Telefone</a><a href="mailto:contato@empresa.test">Email</a>', headers={"Content-Type": "text/html"})
        harness = Harness(website=website)
        try:
            with patch("garimpo.network.public_target", side_effect=pinned):
                result = await WebsiteCollector(harness.http).collect(Candidate(provider_id="brave:1", company="Empresa", website="https://empresa.test/antigo"))
            self.assertEqual(result.phone, "+5551999991001")
            self.assertEqual(result.website, "https://empresa.test/")
            self.assertEqual([r.url.path for r in harness.requests], ["/robots.txt", "/antigo", "/"])
        finally:
            await harness.close()

    def test_extracts_published_contacts_and_ignores_scripts_invalid_cnpj_and_placeholders(self):
        item = Candidate(provider_id="osm:1", company="Empresa")
        links = extract(item, '''
          <script>var sample="fake@empresa.com.br 51988881234";</script>
          <style>.contact{content:"style@empresa.com.br"}</style>
          <a href="tel:+5551999991001">Telefone</a>
          <a href="mailto:comercial@empresa.com.br?subject=Oi">E-mail</a>
          <a href="https://www.instagram.com/empresa.teste/">Instagram</a>
          <a href="/contato">Fale conosco</a>
          <a href="https://other.test/contato">Outro</a>
          <p>CNPJ: 11.222.333/0001-81 / inválido: 11.222.333/0001-80</p>
        ''', "https://empresa.test/")
        self.assertEqual(item.phone, "+5551999991001")
        self.assertEqual(item.email, "comercial@empresa.com.br")
        self.assertEqual(item.cnpj, "11222333000181")
        self.assertEqual(item.instagram, "https://www.instagram.com/empresa.teste")
        self.assertEqual(links, ["https://empresa.test/contato"])
        self.assertFalse(any("fake@" in evidence.value or "style@" in evidence.value for evidence in item.evidence))

    def test_jsonld_refines_company_and_observes_city_without_inventing_contacts(self):
        item = Candidate(provider_id="brave:https://empresa.test/", company="Resultado de pesquisa", city="Canoas")
        extract(item, '''<script type="application/ld+json">{
          "@context":"https://schema.org", "@graph":[{
          "@type":"Dentist", "name":"Clínica Teste", "address":{
          "@type":"PostalAddress", "addressLocality":"Esteio", "addressRegion":"Rio Grande do Sul", "streetAddress":"Rua A, 10"}}]}
          </script><p>exemplo@example.com</p>''', "https://empresa.test/")
        self.assertEqual(item.company, "Clínica Teste")
        self.assertEqual(item.city, "Esteio")
        self.assertEqual(item.state, "RS")
        self.assertEqual(item.location_status, "observed")
        self.assertEqual(item.email, "")
        self.assertEqual(item.phone, "")

    def test_whatsapp_link_and_visible_text(self):
        item = Candidate(provider_id="osm:1", company="Empresa")
        extract(item, '<a href="https://api.whatsapp.com/send?phone=5551999991001&amp;text=Oi">WhatsApp</a><p>comercial@empresa.com.br</p>', "https://empresa.test/")
        self.assertEqual(item.phone, "+5551999991001")
        self.assertEqual(item.email, "comercial@empresa.com.br")

    async def test_robots_disallow_prevents_visiting_company_page(self):
        harness = Harness(website=lambda _: httpx.Response(200, text="User-agent: *\nDisallow: /", headers={"Content-Type": "text/plain"}))
        try:
            with patch("garimpo.network.public_target", side_effect=pinned):
                result = await WebsiteCollector(harness.http).collect(Candidate(provider_id="osm:1", company="Empresa", website="https://empresa.test/"))
            self.assertEqual([r.url.path for r in harness.requests], ["/robots.txt"])
            self.assertIn("robots.txt", " ".join(result.warnings))
        finally:
            await harness.close()

    async def test_robots_unavailable_prevents_collection_and_keeps_provider_contacts(self):
        harness = Harness(website=lambda _: httpx.Response(503, text="unavailable"))
        try:
            original = Candidate(provider_id="osm:1", company="Empresa", website="https://empresa.test/", phone="+5551999991001")
            with patch("garimpo.network.public_target", side_effect=pinned):
                result = await WebsiteCollector(harness.http).collect(original)
            self.assertEqual(result.phone, original.phone)
            self.assertTrue(result.warnings)
            self.assertEqual(len(harness.requests), 1)
        finally:
            await harness.close()

    async def test_contact_page_is_visited_and_cached_for_repeat_search(self):
        def website(request):
            if request.url.path == "/robots.txt":
                return httpx.Response(404)
            body = '<a href="mailto:comercial@empresa.com.br">Email</a>' if request.url.path == "/contato" else '<a href="/contato">Contato</a><a href="tel:51999991001">Telefone</a>'
            return httpx.Response(200, text=body, headers={"Content-Type": "text/html"})
        harness = Harness(website=website)
        try:
            collector = WebsiteCollector(harness.http)
            original = Candidate(provider_id="osm:1", company="Empresa", website="https://empresa.test/")
            with patch("garimpo.network.public_target", side_effect=pinned):
                result = await collector.collect(original)
                repeat = await collector.collect(original)
            self.assertEqual(result.email, "comercial@empresa.com.br")
            self.assertEqual(repeat.email, result.email)
            self.assertEqual([r.url.path for r in harness.requests], ["/robots.txt", "/", "/contato"])
        finally:
            await harness.close()
