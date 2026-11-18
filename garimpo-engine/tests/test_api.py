import asyncio
import unittest
from unittest.mock import patch

import httpx

from garimpo.api import create_app
from garimpo.config import Settings
from support import Harness, pinned


TOKEN = "test-token-with-at-least-32-characters"
QUERY = {"segment": "dentistas", "city": "Canoas", "state": "RS", "limit": 5}


class APITest(unittest.IsolatedAsyncioTestCase):
    async def test_authentication_idempotency_validation_and_export_access(self):
        harness = Harness(api_token=TOKEN, queue_limit=1)
        try:
            app = create_app(harness.settings, http=harness.http)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://motor.test") as client:
                self.assertEqual((await client.get("/health")).status_code, 503)
                self.assertEqual((await client.get("/v1/capabilities")).status_code, 401)
                headers = {"Authorization": "Bearer " + TOKEN, "Idempotency-Key": "same"}
                created = await client.post("/v1/searches", json=QUERY, headers=headers)
                self.assertEqual(created.status_code, 202)
                replay = await client.post("/v1/searches", json=QUERY, headers=headers)
                self.assertEqual(replay.json()["id"], created.json()["id"])
                conflict = await client.post("/v1/searches", json={**QUERY, "city": "Esteio"}, headers=headers)
                self.assertEqual(conflict.status_code, 409)
                full = await client.post("/v1/searches", json=QUERY, headers={"Authorization": headers["Authorization"]})
                self.assertEqual(full.status_code, 429)
                self.assertEqual(full.headers["Retry-After"], "10")
                job_id = created.json()["id"]
                self.assertEqual((await client.get(f"/v1/searches/{job_id}/export")).status_code, 401)
                invalid = await client.post("/v1/searches", json={**QUERY, "limit": 1000}, headers=headers)
                self.assertEqual(invalid.status_code, 422)
                unknown = await client.get("/v1/searches/missing", headers=headers)
                self.assertEqual(unknown.status_code, 404)
                oversized = await client.post("/v1/searches", content="x" * 16385, headers=headers)
                self.assertEqual(oversized.status_code, 413)
                self.assertEqual((await client.post(f"/v1/searches/{job_id}/cancel", headers=headers)).json()["status"], "cancelled")
                self.assertNotIn("candidates", created.json())
                self.assertEqual(created.headers["Cache-Control"], "no-store")
        finally:
            await harness.close()

    async def test_api_worker_executes_and_exports_real_contract(self):
        harness = Harness(api_token=TOKEN)
        try:
            app = create_app(harness.settings, http=harness.http)
            with patch("garimpo.network.public_target", side_effect=pinned):
                async with app.router.lifespan_context(app):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://motor.test", headers={"Authorization": "Bearer " + TOKEN}) as client:
                        self.assertEqual((await client.get("/health")).status_code, 200)
                        created = await client.post("/v1/searches", json=QUERY)
                        job_id = created.json()["id"]
                        for _ in range(100):
                            result = await client.get(f"/v1/searches/{job_id}")
                            if result.json()["status"] in {"completed", "failed"}:
                                break
                            await asyncio.sleep(0.01)
                        self.assertEqual(result.json()["status"], "completed")
                        exported = await client.get(f"/v1/searches/{job_id}/export")
                        self.assertEqual(exported.headers["X-Garimpo-Status"], "completed")
                        self.assertEqual(exported.json()[0]["phone"], "51999991001")
                        self.assertEqual(exported.json()[0]["sourceDetail"], "Motor Python / osm")
        finally:
            await harness.close()

    def test_api_refuses_startup_without_strong_token(self):
        with self.assertRaises(ValueError):
            create_app(Settings(api_token="weak"))
