import unittest

from garimpo.models import Candidate, SearchRequest
from garimpo.ranking import assess


class RankingTest(unittest.TestCase):
    def setUp(self):
        self.request = SearchRequest(segment="dentistas", city="Canoas", state="RS")

    def test_ranks_observed_segment_above_complete_but_unrelated_record(self):
        relevant = Candidate(provider_id="a", company="Odontologia Silva", city="Canoas", state="RS", location_status="observed")
        unrelated = Candidate(provider_id="b", company="Oficina Silva", phone="+5551999991001", email="contato@oficina.test", website="https://oficina.test", city="Canoas", location_status="observed")
        score, reasons = assess(relevant, self.request)
        self.assertGreater(score, assess(unrelated, self.request)[0])
        self.assertTrue(any("Município" in reason for reason in reasons))

    def test_coarse_hairdresser_category_does_not_prove_barbershop(self):
        request = SearchRequest(segment="barbearias", city="Canoas", state="RS")
        broad = Candidate(provider_id="a", company="Salão Beleza Maria", category="shop=hairdresser", city="Canoas", location_status="observed")
        exact = broad.model_copy(update={"provider_id": "b", "company": "Barbearia João"})
        self.assertLess(assess(broad, request)[0], 45)
        self.assertGreater(assess(exact, request)[0], 45)

    def test_explicit_osm_category_and_schema_types_are_evidence(self):
        item = Candidate(provider_id="osm:1", company="Empresa", category="amenity=dentist")
        self.assertGreaterEqual(assess(item, self.request)[0], 70)
        item.category = ""
        item.schema_types = ["Dentist"]
        self.assertGreaterEqual(assess(item, self.request)[0], 70)

    def test_free_niche_requires_all_meaningful_tokens_without_matching_substrings(self):
        request = SearchRequest(segment="software industrial", city="Canoas", state="RS")
        self.assertEqual(assess(Candidate(provider_id="a", company="Software de gestão"), request)[0], 0)
        self.assertGreater(assess(Candidate(provider_id="b", company="Software industrial para fábricas"), request)[0], 0)
        request = request.model_copy(update={"segment": "pet shop"})
        self.assertEqual(assess(Candidate(provider_id="c", company="Carpet Shopping"), request)[0], 0)

    def test_query_locality_without_observed_address_does_not_increase_relevance(self):
        unknown = Candidate(provider_id="a", company="Clínica Odontológica", city="Canoas", state="RS")
        observed = unknown.model_copy(update={"location_status": "observed"})
        self.assertEqual(assess(observed, self.request)[0] - assess(unknown, self.request)[0], 15)
