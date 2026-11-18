import socket
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from garimpo.network import SourceError, UnsafeURL, public_target, retry_delay
from support import Harness, pinned


class NetworkTest(unittest.IsolatedAsyncioTestCase):
    async def test_private_metadata_ipv6_and_mixed_dns_are_blocked(self):
        loop = __import__("asyncio").get_running_loop()
        for addresses in (["127.0.0.1"], ["169.254.169.254"], ["10.0.0.1"], ["::1"], ["::ffff:127.0.0.1"], ["93.184.216.34", "192.168.1.1"]):
            records = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443)) for ip in addresses]
            with self.subTest(addresses=addresses), patch.object(loop, "getaddrinfo", AsyncMock(return_value=records)):
                with self.assertRaises(UnsafeURL):
                    await public_target("https://empresa.test/")

    async def test_connection_is_pinned_to_validated_ip_and_preserves_tls_hostname(self):
        loop = __import__("asyncio").get_running_loop()
        records = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
        with patch.object(loop, "getaddrinfo", AsyncMock(return_value=records)):
            url, headers, extensions = await public_target("https://empresa.test/contato?q=1")
        self.assertEqual(url, "https://93.184.216.34/contato?q=1")
        self.assertEqual(headers["Host"], "empresa.test")
        self.assertEqual(extensions["sni_hostname"], "empresa.test")

    async def test_block_credentials_schemes_and_ports_before_dns(self):
        for url in ("file:///etc/passwd", "https://user:secret@empresa.test", "https://empresa.test:22"):
            with self.assertRaises(UnsafeURL):
                await public_target(url)

    async def test_retries_transient_errors_then_caches_without_exposing_key(self):
        calls = 0
        def provider(request):
            nonlocal calls
            calls += 1
            return httpx.Response(503, headers={"Retry-After": "0"}) if calls == 1 else httpx.Response(200, json={"ok": True})
        harness = Harness(provider=provider)
        try:
            with patch("garimpo.network.asyncio.sleep", AsyncMock()):
                first = await harness.http.json("GET", "https://api.search.brave.com/test", headers={"X-Subscription-Token": "SECRET"})
                second = await harness.http.json("GET", "https://api.search.brave.com/test", headers={"X-Subscription-Token": "SECRET"})
            self.assertEqual(first, second)
            self.assertEqual(calls, 2)
            with harness.store.connect() as connection:
                self.assertNotIn("SECRET", str(connection.execute("select * from cache").fetchall()))
        finally:
            await harness.close()

    async def test_long_retry_after_and_forbidden_are_explicit_errors(self):
        for status in (429, 403):
            harness = Harness(provider=lambda _: httpx.Response(status, headers={"Retry-After": "999"}, text="key=SECRET"))
            try:
                with self.assertRaises(SourceError) as caught:
                    await harness.http.json("GET", "https://api.search.brave.com/test")
                self.assertIn(str(status), str(caught.exception))
                self.assertNotIn("SECRET", str(caught.exception))
                self.assertEqual(len(harness.requests), 1)
            finally:
                await harness.close()

    async def test_cross_site_redirect_and_forbidden_redirect_destination_are_not_fetched(self):
        for destination in ("http://169.254.169.254/latest/meta-data", "https://empresa.test/private"):
            harness = Harness(website=lambda _: httpx.Response(302, headers={"Location": destination}))
            try:
                with patch("garimpo.network.public_target", side_effect=pinned):
                    with self.assertRaises(SourceError):
                        await harness.http.page("https://empresa.test/", before_redirect=AsyncMock(return_value=False))
                self.assertEqual(len(harness.requests), 1)
            finally:
                await harness.close()

    async def test_page_size_and_binary_content_limits(self):
        for response in (httpx.Response(200, text="x" * 100, headers={"Content-Type": "text/html"}), httpx.Response(200, content=b"pdf", headers={"Content-Type": "application/pdf"})):
            harness = Harness(website=lambda _: response)
            try:
                with patch("garimpo.network.public_target", side_effect=pinned):
                    with self.assertRaises(SourceError):
                        await harness.http.page("https://empresa.test/", max_bytes=20)
            finally:
                await harness.close()

    async def test_cookie_is_never_forwarded_between_virtual_hosts_at_same_ip(self):
        def website(request):
            self.assertNotIn("cookie", request.headers)
            return httpx.Response(200, text="ok", headers={"Content-Type": "text/html", "Set-Cookie": "operator_session=secret; Path=/"})
        harness = Harness(website=website)
        try:
            with patch("garimpo.network.public_target", side_effect=pinned):
                await harness.http.page("https://first.test/")
                await harness.http.page("https://second.test/")
            self.assertEqual(len(harness.requests), 2)
        finally:
            await harness.close()

    def test_retry_after_invalid_and_nonfinite_values(self):
        self.assertEqual(retry_delay("nonsense", 2), 4)
        self.assertEqual(retry_delay("NaN", 0), 60)
