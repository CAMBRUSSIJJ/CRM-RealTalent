import unittest

from pydantic import ValidationError

from garimpo.models import Candidate, SearchRequest, deduplicate, phone_number, valid_cnpj, website_url


class ModelsTest(unittest.TestCase):
    def test_search_rejects_unbounded_requests_and_unknown_fields(self):
        for extra in ({"minimum_relevance": 101}, {"minimum_relevance": True}, {"limit": 101}, {"limit": 0}, {"limit": True}, {"limit": 2.5}, {"state": "XX"}, {"url": "http://localhost"}, {"segment": "abc\x00"}):
            with self.subTest(extra=extra), self.assertRaises(ValidationError):
                SearchRequest.model_validate({"segment": "dentista", "city": "Canoas", "state": "RS", **extra})
        self.assertEqual(SearchRequest(segment=" Dentista ", city=" Canoas ", state="rs").state, "RS")

    def test_phone_and_cnpj_validation(self):
        self.assertEqual(phone_number("(51) 99999-1001"), "+5551999991001")
        self.assertEqual(phone_number("+55 (11) 3333-4444 ramal 123"), "+551133334444")
        for invalid in ("123", "00 99999-1234", "(51) 81111-1111", "5191234567", "55" * 7):
            self.assertEqual(phone_number(invalid), "")
        self.assertEqual(valid_cnpj("11.222.333/0001-81"), "11222333000181")
        for invalid in ("11.222.333/0001-80", "00.000.000/0000-00", "AB.222.333/0001-81"):
            self.assertEqual(valid_cnpj(invalid), "")

    def test_rejects_credentials_schemes_and_unexpected_ports(self):
        for url in ("file:///etc/passwd", "https://user:secret@empresa.com", "https://empresa.com:9000", "http://[bad", "javascript:alert(1)"):
            self.assertEqual(website_url(url), "")
        self.assertEqual(website_url("empresa.com.br"), "https://empresa.com.br")

    def test_dedup_merges_evidence_but_preserves_chain_branches(self):
        first = Candidate(provider_id="osm:1", company="Empresa", city="Canoas", state="RS", address="Rua A, 1", phone="+5551999991001")
        duplicate = Candidate(provider_id="brave:1", company="Empresa", city="Canoas", state="RS", address="Rua A, 1", phone=first.phone)
        duplicate.observe("email", "contato@empresa.com.br", "https://empresa.com.br", "site")
        branch = Candidate(provider_id="osm:2", company="Empresa", city="Canoas", state="RS", address="Rua B, 2", phone=first.phone, website="https://empresa.com.br")
        other_city = branch.model_copy(update={"provider_id": "osm:3", "city": "Porto Alegre"})
        result = deduplicate([first, duplicate, branch, other_city])
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0].email, duplicate.email)
        self.assertEqual(len(result[0].evidence), 1)

    def test_export_has_national_phone_and_preserves_provenance(self):
        item = Candidate(provider_id="osm:node:1", company="Empresa", phone="+5551999991001")
        item.observe("email", "contato@empresa.com.br", "https://empresa.com.br/contato", "Site")
        exported = item.capture_draft("dentistas")
        self.assertEqual(exported["phone"], "51999991001")
        self.assertEqual(exported["source"], "manual")
        self.assertEqual(exported["engine"]["evidence"][0]["status"], "published")
        self.assertNotIn("verified", str(exported))

    def test_tracking_parameters_do_not_create_distinct_sites_but_branch_query_is_preserved(self):
        self.assertEqual(website_url("https://EMPRESA.test:443/contato?utm_source=ads&filial=2&gclid=123#form"), "https://empresa.test/contato?filial=2")
        self.assertNotEqual(website_url("https://empresa.test/?filial=1"), website_url("https://empresa.test/?filial=2"))

    def test_merge_prefers_observed_locality_over_query_placeholder(self):
        placeholder = Candidate(provider_id="a", company="Empresa", cnpj="11222333000181", city="Canoas", state="RS")
        observed = Candidate(provider_id="b", company="Empresa", cnpj=placeholder.cnpj, city="Esteio", state="RS", location_status="observed")
        result = deduplicate([placeholder, observed])
        self.assertEqual(result[0].city, "Esteio")
        self.assertEqual(result[0].location_status, "observed")

    def test_transitive_duplicates_merge_once_and_conflicting_cnpjs_remain_separate(self):
        first = Candidate(provider_id="osm:1", company="Empresa", phone="+5551999991001")
        second = Candidate(provider_id="osm:2", company="Empresa", cnpj="11222333000181")
        bridge = Candidate(provider_id="brave:3", company="Empresa", phone=first.phone, cnpj=second.cnpj)
        self.assertEqual(len(deduplicate([first, second, bridge])), 1)
        first = Candidate(provider_id="osm:1", company="Empresa", phone="+5551999991001", cnpj="11222333000181")
        conflicting = first.model_copy(update={"provider_id": "osm:2", "cnpj": "11444777000161"})
        result = deduplicate([first, conflicting])
        self.assertEqual(len(result), 2)
        self.assertTrue(all(item.warnings for item in result))
