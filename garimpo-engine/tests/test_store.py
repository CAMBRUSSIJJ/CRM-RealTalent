from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import time
import unittest

from garimpo.models import SearchRequest
from garimpo.store import IdempotencyConflict, LeaseLost, QueueFull, Store


class StoreTest(unittest.TestCase):
    def test_idempotency_survives_new_optional_search_fields(self):
        import json
        original = self.store.create(self.request, idempotency_key="legacy")
        original["request"].pop("minimum_relevance")
        with self.store.connect() as connection:
            connection.execute("update jobs set request_hash=?,document=? where id=?", ("hash-before-optional-field", json.dumps(original), original["id"]))
        replay = self.store.create(self.request, idempotency_key="legacy")
        self.assertEqual(replay["id"], original["id"])
        with self.assertRaises(IdempotencyConflict):
            self.store.create(self.request.model_copy(update={"minimum_relevance": 60}), idempotency_key="legacy")

    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.store = Store(Path(self.temporary.name) / "test.db")
        self.request = SearchRequest(segment="dentista", city="Canoas", state="RS")

    def tearDown(self):
        self.temporary.cleanup()

    def test_idempotency_replay_conflict_and_queue_limit(self):
        first = self.store.create(self.request, idempotency_key="same", queue_limit=1)
        self.assertEqual(self.store.create(self.request, idempotency_key="same", queue_limit=1)["id"], first["id"])
        with self.assertRaises(IdempotencyConflict):
            self.store.create(self.request.model_copy(update={"city": "Esteio"}), idempotency_key="same")
        with self.assertRaises(QueueFull):
            self.store.create(self.request, queue_limit=1)
        self.store.cancel(first["id"])
        self.assertIsNotNone(self.store.create(self.request, queue_limit=1))

    def test_concurrent_claims_never_duplicate_a_job(self):
        for _ in range(8):
            self.store.create(self.request)
        with ThreadPoolExecutor(max_workers=8) as pool:
            jobs = list(pool.map(lambda owner: self.store.claim(str(owner)), range(8)))
        self.assertEqual(len({j["id"] for j in jobs}), 8)
        self.assertIsNone(self.store.claim("extra"))

    def test_checkpoint_survives_new_store_and_cancel_blocks_stale_writer(self):
        original = self.store.create(self.request)
        job = self.store.claim("worker")
        job["results"] = [{"company": "Preservada"}]
        self.store.save(job, "worker")
        reopened = Store(self.store.path)
        self.assertEqual(reopened.get(job["id"])["results"], job["results"])
        cancelled = reopened.cancel(original["id"])
        self.assertEqual(cancelled["status"], "cancelled")
        with self.assertRaises(LeaseLost):
            self.store.save(job, "worker")
        self.store.release(job["id"], "worker")
        self.assertEqual(self.store.get(job["id"])["status"], "cancelled")

    def test_expired_lease_requeues_and_invalidates_old_owner(self):
        self.store.create(self.request)
        job = self.store.claim("old")
        job["done_ids"] = ["osm:1"]
        self.store.save(job, "old")
        with self.store.connect() as connection:
            connection.execute("update jobs set lease_until=0")
        recovered = self.store.claim("new")
        self.assertEqual(recovered["done_ids"], ["osm:1"])
        with self.assertRaises(LeaseLost):
            self.store.save(job, "old")
        self.store.release(job["id"], "new")
        self.assertEqual(self.store.get(job["id"])["status"], "queued")

    def test_repeated_crashes_eventually_fail_without_losing_results(self):
        self.store.create(self.request)
        for index in range(3):
            job = self.store.claim(str(index))
            job["results"] = [{"company": "Preservada"}]
            self.store.save(job, str(index))
            with self.store.connect() as connection:
                connection.execute("update jobs set lease_until=0")
        self.assertIsNone(self.store.claim("fourth"))
        document = self.store.get(job["id"])
        self.assertEqual(document["status"], "failed")
        self.assertEqual(len(document["results"]), 1)

    def test_cache_expiry_and_disabled_cache(self):
        self.store.cache_put("valid", {"ok": True}, 10)
        self.assertEqual(self.store.cache_get("valid"), {"ok": True})
        self.store.cache_put("disabled", {}, 0)
        self.assertIsNone(self.store.cache_get("disabled"))
        with self.store.connect() as connection:
            connection.execute("update cache set expires_at=?", (time.time() - 1,))
        self.assertIsNone(self.store.cache_get("valid"))
