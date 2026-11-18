import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import httpx

from garimpo.engine import Engine
from garimpo.models import SearchRequest
from garimpo.network import SourceError
from garimpo.osm_index import build_index, index_info, lookup_index, point_in_geometry
from garimpo.providers import OSM_TAGS
from support import GEOCODE, Harness


GEOMETRY = {"type":"Polygon", "coordinates":[[[-51.3,-30],[-51.1,-30],[-51.1,-29.8],[-51.3,-29.8],[-51.3,-30]]]}
LOCATION = {**GEOCODE[0], "boundingbox":["-30","-29.8","-51.3","-51.1"], "geojson":GEOMETRY}
XML = '''<?xml version="1.0" encoding="UTF-8"?><osm version="0.6" generator="unit-test">
<bounds minlat="-31" minlon="-53" maxlat="-28" maxlon="-50"/>
<node id="1" version="1" lat="-29.9" lon="-51.2"><tag k="name" v="Barbearia de Teste"/><tag k="shop" v="hairdresser"/><tag k="phone" v="51999991001"/><tag k="addr:city" v="Canoas"/></node>
<node id="2" version="1" lat="-29.9" lon="-51.21"><tag k="name" v="Restaurante de Teste"/><tag k="amenity" v="restaurant"/></node>
<node id="3" version="1" lat="-29" lon="-51.2"><tag k="name" v="Fora do Município"/><tag k="shop" v="hairdresser"/></node>
<node id="10" version="1" lat="-29.85" lon="-51.15"/><node id="11" version="1" lat="-29.86" lon="-51.15"/><node id="12" version="1" lat="-29.86" lon="-51.16"/>
<way id="20" version="1"><nd ref="10"/><nd ref="11"/><nd ref="12"/><nd ref="10"/><tag k="name" v="Dentista de Teste"/><tag k="amenity" v="dentist"/></way>
</osm>'''
CATEGORIES = {pair for tags in OSM_TAGS.values() for pair in tags}


class GeometryTest(unittest.TestCase):
    def test_polygon_holes_and_multipolygon_exclude_neighbours(self):
        self.assertTrue(point_in_geometry(-51.2,-29.9,GEOMETRY))
        self.assertFalse(point_in_geometry(-51,-29.9,GEOMETRY))
        self.assertTrue(point_in_geometry(-51.3,-29.9,GEOMETRY))
        hole=[[-51.22,-29.92],[-51.18,-29.92],[-51.18,-29.88],[-51.22,-29.88],[-51.22,-29.92]]
        with_hole={"type":"Polygon","coordinates":[*GEOMETRY["coordinates"],hole]}
        self.assertFalse(point_in_geometry(-51.2,-29.9,with_hole))
        self.assertTrue(point_in_geometry(-51.15,-29.9,{"type":"MultiPolygon","coordinates":[with_hole["coordinates"]]}))
        with self.assertRaises(SourceError):
            point_in_geometry(0,0,{"type":"Point","coordinates":[0,0]})
        with self.assertRaises(SourceError):
            point_in_geometry(0,0,{"type":"Polygon","coordinates":[]})

    def test_missing_index_is_not_reported_as_zero_companies(self):
        with TemporaryDirectory() as directory, self.assertRaises(SourceError):
            index_info(Path(directory)/"missing.db")


@unittest.skipUnless(importlib.util.find_spec("osmium"), "Instale o extra snapshot para testar a importação OSM")
class IndexTest(unittest.TestCase):
    def setUp(self):
        self.directory=TemporaryDirectory()
        self.source=Path(self.directory.name)/"fixture.osm"
        self.source.write_text(XML)
        self.output=Path(self.directory.name)/"index.db"

    def tearDown(self):
        self.directory.cleanup()

    def build(self):
        return build_index(self.source,self.output,source_url="https://example.test/public.osm.pbf",snapshot_at="2026-11-14T00:00:00Z",categories=CATEGORIES,label="Base de teste")

    def test_native_import_query_uses_category_city_polygon_and_snapshot_date(self):
        info=self.build()
        self.assertEqual(info["points"],4)
        hairdressers,metadata=lookup_index(self.output,LOCATION,OSM_TAGS["barbearias"],30)
        self.assertEqual([item["tags"]["name"] for item in hairdressers],["Barbearia de Teste"])
        self.assertEqual(metadata["snapshot_at"],"2026-11-14T00:00:00Z")
        dentists,_=lookup_index(self.output,LOCATION,OSM_TAGS["dentistas"],30)
        self.assertEqual(dentists[0]["type"],"way")

    def test_outside_coverage_fails_explicitly(self):
        self.build()
        with self.assertRaisesRegex(SourceError,"fora da cobertura"):
            lookup_index(self.output,{**LOCATION,"boundingbox":["-40","-39","-55","-54"]},OSM_TAGS["barbearias"],10)

    def test_regional_index_covers_distant_cities_and_rejects_other_states(self):
        regional = XML.replace('minlat="-31"', 'minlat="-34"').replace('</osm>', '<node id="100" version="1" lat="-32.03" lon="-52.1"><tag k="name" v="Barbearia Regional"/><tag k="shop" v="hairdresser"/></node></osm>')
        self.source.write_text(regional)
        info=build_index(self.source,self.output,source_url="https://example.test/sul.osm.pbf",snapshot_at="2026-11-14T00:00:00Z",categories=CATEGORIES,states=["RS","SC","PR"])
        self.assertEqual(info["states"],["PR","RS","SC"])
        self.assertEqual(len(lookup_index(self.output,LOCATION,OSM_TAGS["barbearias"],30,state="RS")[0]),1)
        rio={"boundingbox":["-32.1","-32","-52.2","-52"],"geojson":{"type":"Polygon","coordinates":[[[-52.2,-32.1],[-52,-32.1],[-52,-32],[-52.2,-32],[-52.2,-32.1]]]}}
        self.assertEqual(lookup_index(self.output,rio,OSM_TAGS["barbearias"],30,state="RS")[0][0]["id"],100)
        with self.assertRaisesRegex(SourceError,"UF está fora"):
            lookup_index(self.output,rio,OSM_TAGS["barbearias"],30,state="SP")

    def test_native_geometry_keeps_vertices_outside_crop(self):
        info=build_index(self.source,self.output,source_url="https://example.test/base.osm.pbf",snapshot_at="2026-11-14T00:00:00Z",categories=CATEGORIES,bounds=[-51.2,-29.86,-51.151,-29.84])
        self.assertEqual(info["counts"]["way"],1)
        self.assertEqual(info["counts"]["skipped_geometry"],0)

    def test_unsuccessful_rebuild_preserves_existing_base(self):
        self.build()
        before=self.output.read_bytes()
        self.source.write_text('<osm version="0.6"><bounds minlat="-31" minlon="-53" maxlat="-28" maxlon="-50"/></osm>')
        with self.assertRaises(ValueError):
            self.build()
        self.assertEqual(self.output.read_bytes(),before)
        self.assertEqual(list(self.output.parent.glob('*.tmp')),[])


@unittest.skipUnless(importlib.util.find_spec("osmium"), "Instale o extra snapshot para testar a importação OSM")
class IndexedEngineTest(unittest.IsolatedAsyncioTestCase):
    async def test_real_engine_never_calls_overpass_when_own_base_is_prepared(self):
        with TemporaryDirectory() as directory:
            root=Path(directory)
            source=root/"fixture.osm";source.write_text(XML)
            output=root/"base.db"
            build_index(source,output,source_url="https://example.test/base.osm.pbf",snapshot_at="2026-11-14T00:00:00Z",categories=CATEGORIES)
            def provider(request):
                self.assertEqual(request.url.host,"nominatim.openstreetmap.org")
                self.assertEqual(request.url.params["polygon_geojson"],"1")
                return httpx.Response(200,json=[LOCATION])
            harness=Harness(osm_index_path=output,provider=provider)
            try:
                request=SearchRequest(segment="barbearias",city="Canoas",state="RS",require_phone=True,enrich_websites=False)
                result=await Engine(harness.http,harness.store).run_one(harness.store.create(request)["id"])
                self.assertEqual(result["status"],"completed")
                self.assertEqual(len(result["results"]),1)
                self.assertEqual(result["results"][0]["phone"],"51999991001")
                self.assertEqual(result["results"][0]["engine"]["dataset"]["snapshot_at"],"2026-11-14T00:00:00Z")
                self.assertEqual(result["metrics"]["local_index_queries"],1)
                self.assertEqual(result["metrics"]["discovery_requests"],1)
                # Ausência de e-mail publicado é uma busca concluída sem
                # elegíveis, e não um erro de cobertura ou da fonte.
                strict=SearchRequest(segment="barbearias",city="Canoas",state="RS",require_phone=True,require_email=True,enrich_websites=True)
                filtered=await Engine(harness.http,harness.store).run_one(harness.store.create(strict)["id"])
                self.assertEqual(filtered["status"],"completed")
                self.assertEqual(filtered["results"],[])
                self.assertEqual(filtered["metrics"]["rejected"]["missing_email"],1)
            finally:
                await harness.close()
