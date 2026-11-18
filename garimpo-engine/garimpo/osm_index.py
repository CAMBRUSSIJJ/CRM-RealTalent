"""Índice próprio de pontos comerciais OSM. A consulta não depende do Overpass."""
from contextlib import closing
from datetime import datetime
import json
import math
import re
from pathlib import Path
import sqlite3
from uuid import uuid4

from .models import now, osm_phone, website_url
from .network import SourceError


def valid_bounds(bounds):
    if len(bounds) != 4:
        raise ValueError("Informe os limites oeste, sul, leste e norte da base.")
    west, south, east, north = map(float, bounds)
    if not all(math.isfinite(v) for v in (west, south, east, north)) or not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("Limites geográficos da base inválidos.")
    return west, south, east, north


def point_in_ring(lon: float, lat: float, ring: list) -> bool:
    inside = False
    if len(ring) < 4:
        return False
    x1, y1 = ring[-1][:2]
    for position in ring:
        x2, y2 = position[:2]
        cross = (lon - x1) * (y2 - y1) - (lat - y1) * (x2 - x1)
        if abs(cross) < 1e-10 and min(x1, x2) <= lon <= max(x1, x2) and min(y1, y2) <= lat <= max(y1, y2):
            return True
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
        x1, y1 = x2, y2
    return inside


def point_in_geometry(lon: float, lat: float, geometry: dict) -> bool:
    kind, coordinates = geometry.get("type"), geometry.get("coordinates")
    if kind not in {"Polygon", "MultiPolygon"} or not isinstance(coordinates, list) or not coordinates:
        raise SourceError("Não foi possível conferir o contorno do município na fonte geográfica.")
    polygons = [coordinates] if kind == "Polygon" else coordinates
    try:
        if any(not rings or any(len(ring) < 4 or ring[0][:2] != ring[-1][:2] for ring in rings) for rings in polygons):
            raise ValueError()
        return any(rings and point_in_ring(lon, lat, rings[0]) and not any(point_in_ring(lon, lat, ring) for ring in rings[1:]) for rings in polygons)
    except (TypeError, ValueError, IndexError) as exc:
        raise SourceError("A fonte geográfica retornou um contorno inválido.") from exc


def index_info(path: Path) -> dict:
    try:
        if not path.is_file():
            raise ValueError()
        with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=3)) as connection:
            row = connection.execute("select value from metadata where key='info'").fetchone()
        info = json.loads(row[0])
        if info.get("schema_version") != 1 or type(info.get("points")) is not int or info["points"] <= 0:
            raise ValueError()
        if any(not isinstance(info.get(key), str) or not info[key] for key in ("label", "source_url", "snapshot_at", "licence")):
            raise ValueError()
        if not website_url(info["source_url"]) or datetime.fromisoformat(info["snapshot_at"].replace("Z", "+00:00")).tzinfo is None:
            raise ValueError()
        if "states" in info and (not isinstance(info["states"], list) or any(not isinstance(state, str) or not re.fullmatch(r"[A-Z]{2}", state) for state in info["states"])):
            raise ValueError()
        valid_bounds(info["bounds"])
        return info
    except (OSError, sqlite3.Error, ValueError, TypeError, KeyError) as exc:
        raise SourceError("A base aberta de empresas não está pronta neste ambiente. Prepare ou atualize o índice OSM.") from exc


def build_index(source: Path, destination: Path, *, source_url: str, snapshot_at: str,
                categories: set[tuple[str, str]], bounds=None, label="Base OpenStreetMap", states=None) -> dict:
    try:
        import osmium
    except ImportError as exc:
        raise ValueError("Instale o extra snapshot para preparar a base: pip install '.[snapshot]'.") from exc
    if not source.is_file() or source.resolve() == destination.resolve():
        raise ValueError("Informe um arquivo OSM de entrada e um índice de saída diferentes.")
    if not website_url(source_url):
        raise ValueError("Informe a URL pública de origem da extração OSM.")
    timestamp = datetime.fromisoformat(snapshot_at.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        raise ValueError("A data da extração deve incluir o fuso horário.")
    states = sorted(set(states or []))
    if any(not re.fullmatch(r"AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO", state) for state in states):
        raise ValueError("Informe UFs brasileiras válidas para a cobertura da extração.")
    if bounds is None:
        with osmium.io.Reader(str(source)) as reader:
            box = reader.header().box()
            if not box.valid():
                raise ValueError("A extração não informa sua cobertura. Use --bounds oeste sul leste norte.")
            bounds = (box.bottom_left.lon, box.bottom_left.lat, box.top_right.lon, box.top_right.lat)
    bounds = valid_bounds(bounds)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + "." + uuid4().hex + ".tmp")
    counts = {"node": 0, "way": 0, "skipped_geometry": 0}
    try:
        with closing(sqlite3.connect(temporary)) as connection, connection:
            connection.executescript("""
                create table metadata(key text primary key,value text not null);
                create table points(pk integer primary key,kind text not null,osm_id integer not null,
                    lon real not null,lat real not null,tags text not null,quality integer not null,
                    unique(kind,osm_id));
                create table categories(point_id integer not null,category text not null,
                    primary key(point_id,category));
            """)

            class Handler(osmium.SimpleHandler):
                def relevant(self, obj):
                    return bool(obj.tags.get("name")) and any(obj.tags.get(key) == value for key, value in categories)

                def record(self, obj, kind, lon, lat):
                    if not math.isfinite(lon) or not math.isfinite(lat):
                        counts["skipped_geometry"] += 1
                        return
                    west, south, east, north = bounds
                    if not (west <= lon <= east and south <= lat <= north):
                        return
                    tags = dict(obj.tags)
                    phone_ok = bool(osm_phone(tags))
                    quality = 30 * phone_ok + 20 * bool(tags.get("contact:email") or tags.get("email")) + 10 * bool(tags.get("contact:website") or tags.get("website"))
                    cursor = connection.execute("insert into points(kind,osm_id,lon,lat,tags,quality) values(?,?,?,?,?,?)",
                                                (kind, obj.id, lon, lat, json.dumps(tags, ensure_ascii=False), quality))
                    connection.executemany("insert into categories values(?,?)", [(cursor.lastrowid, f"{key}={value}") for key, value in categories if tags.get(key) == value])
                    counts[kind] += 1

                def node(self, obj):
                    if self.relevant(obj) and obj.location.valid():
                        self.record(obj, "node", obj.location.lon, obj.location.lat)

                def way(self, obj):
                    if not self.relevant(obj):
                        return
                    if not obj.nodes or any(not node.location.valid() for node in obj.nodes):
                        counts["skipped_geometry"] += 1
                        return
                    positions = [(node.location.lon, node.location.lat) for node in obj.nodes]
                    if len(positions) > 1 and positions[0] == positions[-1]:
                        positions.pop()
                    self.record(obj, "way", sum(p[0] for p in positions) / len(positions), sum(p[1] for p in positions) / len(positions))

            # O índice nativo guarda coordenadas de forma compacta, inclusive
            # vértices fora de um recorte usados por polígonos que o atravessam.
            Handler().apply_file(str(source), locations=True, idx="flex_mem")
            connection.executescript("create index point_location on points(lat,lon); create index category_lookup on categories(category,point_id);")
            info = {"schema_version": 1, "label": label, "source_url": source_url,
                    "snapshot_at": snapshot_at, "built_at": now(), "bounds": list(bounds),
                    "points": counts["node"] + counts["way"], "counts": counts,
                    "licence": "ODbL — OpenStreetMap contributors", "states": states}
            connection.execute("insert into metadata values('info',?)", (json.dumps(info, ensure_ascii=False),))
        if not info["points"]:
            raise ValueError("A extração não contém pontos comerciais reconhecíveis; o índice anterior foi preservado.")
        temporary.chmod(0o600)
        temporary.replace(destination)
        return info
    finally:
        temporary.unlink(missing_ok=True)


def lookup_index(path: Path, location: dict, categories: list[tuple[str, str]], limit: int, *, state=None) -> tuple[list[dict], dict]:
    info = index_info(path)
    if info.get("states") and (state or location.get("address", {}).get("ISO3166-2-lvl4", "").removeprefix("BR-")) not in info["states"]:
        raise SourceError("Esta UF está fora da cobertura da base preparada. Cobertura atual: " + ", ".join(info["states"]) + ".")
    south, north, west, east = map(float, location["boundingbox"])
    coverage = info["bounds"]
    if not (coverage[0] <= west < east <= coverage[2] and coverage[1] <= south < north <= coverage[3]):
        raise SourceError("Este município está fora da cobertura da base preparada. É necessário carregar a extração da região correspondente.")
    geometry = location.get("geojson", {})
    # Valida a geometria mesmo quando o índice não retornar nenhum ponto.
    point_in_geometry(west, south, geometry)
    selectors = [f"{key}={value}" for key, value in categories]
    placeholders = ",".join("?" for _ in selectors)
    rows = []
    try:
        with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=3)) as connection:
            cursor = connection.execute(f"""select distinct p.kind,p.osm_id,p.lon,p.lat,p.tags from points p
                join categories c on c.point_id=p.pk where c.category in ({placeholders})
                and p.lon between ? and ? and p.lat between ? and ?
                order by p.quality desc,p.osm_id limit 2000""", (*selectors, west, east, south, north))
            for kind, osm_id, lon, lat, tags in cursor:
                if point_in_geometry(lon, lat, geometry):
                    rows.append({"type": kind, "id": osm_id, "tags": json.loads(tags)})
                if len(rows) >= limit:
                    break
    except (sqlite3.Error, ValueError) as exc:
        raise SourceError("Não foi possível consultar a base aberta preparada. O arquivo precisa ser conferido ou atualizado.") from exc
    return rows, info
