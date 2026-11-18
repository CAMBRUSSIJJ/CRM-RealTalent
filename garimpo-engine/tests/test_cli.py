import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from garimpo.models import SearchRequest
from garimpo.store import Store


class CLITest(unittest.TestCase):
    def run_cli(self, *args, **environment):
        return subprocess.run([sys.executable, "-m", "garimpo", *args], text=True, capture_output=True,
                              timeout=10, env={**os.environ, **environment})

    def test_segments_and_help_work_without_api_key(self):
        result = self.run_cli("segments", BRAVE_SEARCH_API_KEY="")
        self.assertEqual(result.returncode, 0)
        self.assertIn("dentista", json.loads(result.stdout))
        self.assertEqual(self.run_cli("search", "--help").returncode, 0)

    def test_invalid_provider_setup_returns_nonzero_without_fake_results(self):
        with TemporaryDirectory() as directory:
            result = self.run_cli("search", "--segment", "software", "--city", "Canoas", "--state", "RS", "--provider", "brave",
                                  BRAVE_SEARCH_API_KEY="", GARIMPO_DB=str(Path(directory) / "test.db"))
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")
            self.assertIn("BRAVE_SEARCH_API_KEY", result.stderr)

    def test_persisted_job_can_be_consulted_from_new_process(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "test.db"
            job = Store(path).create(SearchRequest(segment="dentista", city="Canoas", state="RS"))
            result = self.run_cli("status", job["id"], GARIMPO_DB=str(path))
            self.assertEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stdout)["status"], "queued")
            self.assertNotIn("candidates", result.stdout)

    def test_api_refuses_weak_token_before_listening(self):
        result = self.run_cli("serve", GARIMPO_API_TOKEN="weak")
        self.assertEqual(result.returncode, 2)
        self.assertIn("32 caracteres", result.stderr)
