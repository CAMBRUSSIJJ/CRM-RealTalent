import asyncio
import unittest
from unittest.mock import patch

import httpx

from garimpo.preview import create_preview
from support import Harness, pinned


ACCESS = "preview-access-token-for-browser-tests-only"
API_TOKEN = "private-engine-key-never-sent-to-browser"
HEADERS = {"X-Garimpo-Preview": "1"}


class PreviewTest(unittest.IsolatedAsyncioTestCase):
    async def test_access_is_private_and_worker_secret_never_reaches_assets(self):
        harness = Harness(api_token=API_TOKEN)
        try:
            app = create_preview(harness.settings, ACCESS, secure_cookies=False, http=harness.http)
            async with app.router.lifespan_context(app):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://preview.test") as client:
                    for path in ("/", "/assets/preview.js", "/assets/preview.css"):
                        response = await client.get(path)
                        self.assertEqual(response.status_code, 200)
                        self.assertNotIn(API_TOKEN, response.text)
                        self.assertNotIn(ACCESS, response.text)
                        self.assertEqual(response.headers["Referrer-Policy"], "no-referrer")
                    self.assertEqual((await client.get("/preview-api/capabilities")).status_code, 401)
                    self.assertEqual((await client.get("/v1/capabilities")).status_code, 404)
                    self.assertEqual((await client.post("/preview-auth", json={"access": ACCESS})).status_code, 403)
                    wrong = await client.post("/preview-auth", json={"access": "wrong"}, headers=HEADERS)
                    self.assertEqual(wrong.status_code, 401)
                    authenticated = await client.post("/preview-auth", json={"access": ACCESS}, headers=HEADERS)
                    self.assertEqual(authenticated.status_code, 200)
                    self.assertIn("HttpOnly", authenticated.headers["Set-Cookie"])
                    self.assertNotIn(API_TOKEN, authenticated.headers["Set-Cookie"])
                    self.assertNotIn(ACCESS, authenticated.headers["Set-Cookie"])
                    self.assertEqual((await client.get("/preview-api/capabilities")).status_code, 200)
                    self.assertEqual((await client.post("/preview-api/searches", json={})).status_code, 403)
                    self.assertEqual((await client.get("/preview-api/unknown/resource")).status_code, 404)
                    too_large = await client.post("/preview-auth", content="x"*16385, headers=HEADERS)
                    self.assertEqual(too_large.status_code, 413)
        finally:
            await harness.close()

    async def test_browser_session_can_search_poll_and_export_without_api_key(self):
        harness = Harness(api_token=API_TOKEN)
        try:
            app = create_preview(harness.settings, ACCESS, secure_cookies=False, http=harness.http)
            with patch("garimpo.network.public_target", side_effect=pinned):
                async with app.router.lifespan_context(app):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://preview.test", headers=HEADERS) as client:
                        await client.post("/preview-auth", json={"access": ACCESS})
                        created = await client.post("/preview-api/searches", json={"segment":"dentista","city":"Canoas","state":"RS","limit":1})
                        self.assertEqual(created.status_code, 202)
                        job_id = created.json()["id"]
                        for _ in range(100):
                            result = await client.get("/preview-api/searches/"+job_id)
                            if result.json()["status"] in {"completed","failed"}:
                                break
                            await asyncio.sleep(0.01)
                        self.assertEqual(result.json()["status"], "completed")
                        exported = await client.get("/preview-api/searches/"+job_id+"/export")
                        self.assertEqual(exported.json()[0]["phone"], "51999991001")
                        self.assertIn("attachment", exported.headers["Content-Disposition"])
                        self.assertNotIn(API_TOKEN, exported.text)
        finally:
            await harness.close()

    def test_browser_access_must_use_a_different_secret_from_the_api(self):
        from garimpo.config import Settings
        with self.assertRaises(ValueError):
            create_preview(Settings(api_token=API_TOKEN), API_TOKEN)
