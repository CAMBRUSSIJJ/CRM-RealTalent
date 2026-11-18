from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    db_path: Path = Path("data/garimpo.sqlite3")
    api_token: str = ""
    brave_key: str = ""
    user_agent: str = "RealTalentGarimpo/0.6 (+https://github.com/CAMBRUSSIJJ/CRM-RealTalent)"
    contact_email: str = ""
    concurrency: int = 4
    job_timeout: int = 180
    cache_ttl: int = 86400
    queue_limit: int = 20
    osm_index_path: Path | None = None
    recovery_query_limit: int = 20
    maps_binary: Path | None = None
    maps_timeout: int = 120
    maps_query_limit: int = 6
    ollama_url: str = ""
    ollama_model: str = "qwen2.5:7b"

    def __post_init__(self):
        if not 1 <= self.maps_query_limit <= 12:
            raise ValueError("GARIMPO_MAPS_QUERY_LIMIT deve estar entre 1 e 12.")
        if not 15 <= self.maps_timeout <= 600:
            raise ValueError("GARIMPO_MAPS_TIMEOUT deve estar entre 15 e 600 segundos.")
        if self.ollama_url:
            from urllib.parse import urlsplit
            url = urlsplit(self.ollama_url)
            if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or url.query or url.fragment:
                raise ValueError("GARIMPO_OLLAMA_URL deve ser a URL do servidor, sem credenciais ou parâmetros.")
        if not 0 <= self.recovery_query_limit <= 100:
            raise ValueError("GARIMPO_RECOVERY_QUERY_LIMIT deve estar entre 0 e 100.")
        if not 1 <= self.concurrency <= 8:
            raise ValueError("GARIMPO_CONCURRENCY deve estar entre 1 e 8.")
        if not 15 <= self.job_timeout <= 900:
            raise ValueError("GARIMPO_JOB_TIMEOUT deve estar entre 15 e 900 segundos.")
        if not 0 <= self.cache_ttl <= 604800:
            raise ValueError("GARIMPO_CACHE_TTL deve estar entre 0 e 604800 segundos.")
        if not 1 <= self.queue_limit <= 100:
            raise ValueError("GARIMPO_QUEUE_LIMIT deve estar entre 1 e 100.")
        if not self.user_agent.strip() or any(c in self.user_agent + self.contact_email for c in "\r\n"):
            raise ValueError("Identificação do operador inválida.")

    @classmethod
    def from_env(cls):
        return cls(
            db_path=Path(os.getenv("GARIMPO_DB", "data/garimpo.sqlite3")),
            api_token=os.getenv("GARIMPO_API_TOKEN", ""),
            brave_key=os.getenv("BRAVE_SEARCH_API_KEY", ""),
            user_agent=os.getenv("GARIMPO_USER_AGENT", cls.user_agent),
            contact_email=os.getenv("GARIMPO_CONTACT_EMAIL", ""),
            concurrency=int(os.getenv("GARIMPO_CONCURRENCY", "4")),
            job_timeout=int(os.getenv("GARIMPO_JOB_TIMEOUT", "180")),
            cache_ttl=int(os.getenv("GARIMPO_CACHE_TTL", "86400")),
            queue_limit=int(os.getenv("GARIMPO_QUEUE_LIMIT", "20")),
            osm_index_path=Path(os.environ["GARIMPO_OSM_INDEX"]) if os.getenv("GARIMPO_OSM_INDEX") else None,
            recovery_query_limit=int(os.getenv("GARIMPO_RECOVERY_QUERY_LIMIT", "20")),
            maps_binary=Path(os.environ["GARIMPO_MAPS_BINARY"]) if os.getenv("GARIMPO_MAPS_BINARY") else None,
            maps_timeout=int(os.getenv("GARIMPO_MAPS_TIMEOUT", "120")),
            maps_query_limit=int(os.getenv("GARIMPO_MAPS_QUERY_LIMIT", "6")),
            ollama_url=os.getenv("GARIMPO_OLLAMA_URL", "").rstrip("/"),
            ollama_model=os.getenv("GARIMPO_OLLAMA_MODEL", "qwen2.5:7b"),
        )
