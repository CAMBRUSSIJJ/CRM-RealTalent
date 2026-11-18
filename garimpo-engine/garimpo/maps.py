"""Adaptador do gosom v1.19.0. Sem shell, login, proxy ou coleta de avaliações pessoais."""
import asyncio
from contextlib import aclosing, suppress
import hashlib
import json
import math
import os
from pathlib import Path
import signal
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from .models import Candidate, Evidence, deduplicate, now, normalized, phone_number, website_url
from .network import SourceError
from .osm_index import point_in_geometry
from .providers import STATES
from .maps_planner import plan_queries
from .store import LeaseLost


MAX_BYTES = 8 * 1024 * 1024
LISTING_FIELDS={"title","link","place_id","cid","category","address","complete_address","latitude","longitude","longtitude","phone","web_site","website","review_rating","review_count","status","description"}


class MapsBlocked(SourceError):
    pass


def child_processes(parent):
    """Identifica filhos, inclusive navegadores que criam sua própria sessão."""
    processes={}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdecimal():continue
        try:
            fields=(entry/'stat').read_text().rsplit(')',1)[1].split()
            processes[int(entry.name)]=(int(fields[1]),fields[19])
        except (OSError,ValueError,IndexError):continue
    found={parent};children=[]
    while True:
        new=[pid for pid,(ppid,_) in processes.items() if ppid in found and pid not in found]
        if not new:break
        children.extend((pid,processes[pid][1]) for pid in new);found.update(new)
    return children


def same_process(pid,start):
    try:
        fields=Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()
        return fields[19]==start and fields[0]!='Z'
    except (OSError,IndexError):return False


async def terminate(process):
    if process.returncode is not None:
        return
    children=child_processes(process.pid)
    with suppress(ProcessLookupError):
        os.killpg(process.pid, signal.SIGTERM)
    try:
        await asyncio.wait_for(process.wait(), 3)
    except TimeoutError:
        with suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGKILL)
        await process.wait()
    # Playwright pode iniciar o Chromium em outro grupo. Não deixe esses
    # processos vivos após cancelamento ou timeout do coletor.
    for pid,start in reversed(children):
        if same_process(pid,start):
            with suppress(ProcessLookupError):os.kill(pid,signal.SIGTERM)
    if children:
        await asyncio.sleep(0.1)
    for pid,start in reversed(children):
        if same_process(pid,start):
            with suppress(ProcessLookupError):os.kill(pid,signal.SIGKILL)


async def run_maps(request, http, coordinates, *, on_batch=None, term=None, zoom=15):
    """Processo isolado; cancelar a pesquisa encerra também os navegadores filhos."""
    binary = http.settings.maps_binary.resolve()
    rows, partial = [], False
    with TemporaryDirectory(prefix="garimpo-maps-") as folder:
        root = Path(folder)
        source, output, log = root/"queries.txt", root/"places.jsonl", root/"scraper.log"
        source.write_text(f"{term or request.segment} em {request.city} {request.state} Brasil\n")
        env = {key: value for key, value in os.environ.items() if key in {"PATH", "HOME", "LANG", "LD_LIBRARY_PATH", "XDG_CACHE_HOME", "SSL_CERT_FILE", "SSL_CERT_DIR", "PLAYWRIGHT_BROWSERS_PATH", "PLAYWRIGHT_DRIVER_PATH"}}
        env["DISABLE_TELEMETRY"] = "1"
        args = [str(binary), "-input", str(source), "-results", str(output), "-json", "-lang", "pt", "-geo", coordinates,"-zoom",str(zoom),
                "-depth", str(min(5, max(1, math.ceil(request.limit*3/20)))), "-c", "1", "-exit-on-inactivity", "30s"]
        http.count("maps_runs")
        offset=0;pending=b''
        async def drain(final=False):
            nonlocal offset,pending,partial
            if not output.exists():return
            if output.stat().st_size>MAX_BYTES:raise SourceError("O coletor Maps excedeu o limite de dados desta pesquisa.")
            with output.open('rb') as stream:
                stream.seek(offset);data=stream.read(MAX_BYTES+1);offset=stream.tell()
            lines=(pending+data).split(b'\n');pending=lines.pop()
            if final and pending:lines.append(pending);pending=b''
            fresh=[]
            for line in lines:
                if not line.strip():continue
                try:
                    row=json.loads(line)
                    if isinstance(row,dict):fresh.append({key:value for key,value in row.items() if key in LISTING_FIELDS})
                except (ValueError,UnicodeError):partial=True
            rows.extend(fresh)
            if fresh and on_batch is not None:await on_batch(fresh)
        def check_block():
            with log.open('rb') as stream:
                stream.seek(max(0,log.stat().st_size-16000));text=stream.read().decode(errors='replace').lower()
            if any(marker in text for marker in ('captcha','unusual traffic','access denied')):
                raise MapsBlocked("Google Maps restringiu a coleta. A pesquisa foi interrompida; tente novamente mais tarde.")
        with log.open("wb") as errors:
            process = await asyncio.create_subprocess_exec(*args, cwd=root, env=env, stdout=errors, stderr=errors, stdin=asyncio.subprocess.DEVNULL, start_new_session=True)
            finished = asyncio.create_task(process.wait())
            try:
                async with asyncio.timeout(http.settings.maps_timeout):
                    while process.returncode is None:
                        if (output.exists() and output.stat().st_size > MAX_BYTES) or log.stat().st_size > MAX_BYTES:
                            raise SourceError("O coletor Maps excedeu o limite de dados desta pesquisa.")
                        check_block()
                        await drain()
                        try:
                            await asyncio.wait_for(asyncio.shield(finished), 0.5)
                        except TimeoutError:
                            pass
            except TimeoutError:
                partial = True
            finally:
                await terminate(process)
                await finished
        check_block()
        await drain(final=True)
        partial = partial or process.returncode != 0
        if not rows:
            raise SourceError("O coletor Maps não retornou registros utilizáveis. Isso não comprova ausência de empresas; confira a instalação e a disponibilidade da fonte.")
    return rows, partial


def row_identity(row):
    return str(row.get('place_id') or row.get('cid') or row.get('link') or hashlib.sha256(json.dumps(row,sort_keys=True).encode()).hexdigest())


async def source_batches(request,http,step,cache_key=None,observed_at=None):
    """O produtor continua lendo o coletor enquanto o consumidor confere contatos."""
    queue=asyncio.Queue(maxsize=4);sent=set();collected=[];completed=False;blocked=False
    async def emit(rows):
        fresh=[];keys=set()
        for row in rows:
            key=row_identity(row)
            if key not in sent and key not in keys:fresh.append(row);keys.add(key)
        if fresh:
            collected.extend(fresh)
            await queue.put(('batch',fresh));sent.update(keys)
    async def produce():
        nonlocal completed,blocked
        try:
            rows,partial=await run_maps(request,http,step['coordinates'],on_batch=emit,term=step['term'],zoom=step['zoom'])
            completed=not partial
            if cache_key and completed:
                http.store.cache_put(cache_key,{'rows':rows,'complete':True,'observed_at':observed_at},min(3600,http.settings.cache_ttl))
            # Compatível também com coletores que escrevem apenas ao terminar.
            await emit(rows)
            await queue.put(('end',(rows,partial)))
        except asyncio.CancelledError:raise
        except Exception as exc:
            blocked=isinstance(exc,MapsBlocked)
            await queue.put(('error',exc))
    producer=asyncio.create_task(produce())
    try:
        while True:
            kind,payload=await queue.get()
            if kind=='error':raise payload
            yield kind,payload
            if kind=='end':return
    finally:
        if not producer.done():producer.cancel()
        with suppress(asyncio.CancelledError):await producer
        if cache_key and collected and not completed and not blocked:
            # O cache incompleto só será usado se já bastar para os filtros
            # da próxima busca; nunca é marcado como consulta concluída.
            unique={row_identity(row):row for row in collected}
            http.store.cache_put(cache_key,{'rows':list(unique.values()),'complete':False,'observed_at':observed_at},min(3600,http.settings.cache_ttl))


def cache_satisfies(rows,request,location,observed_at):
    from .ranking import assess
    candidates=[]
    for row in rows:
        item=listing_candidate(row,request,location,observed_at)
        if item:candidates.append(item)
    return sum(bool((not request.require_phone or item.phone) and (not request.require_email or item.email) and assess(item,request)[0]>=request.minimum_relevance) for item in deduplicate(candidates))>=request.limit


def listing_candidate(row, request, location, observed_at):
    if normalized(str(row.get("status") or "")) in {"permanently closed","fechado permanentemente","encerrado permanentemente"}:
        return None
    name = str(row.get("title") or "").strip()[:200]
    link = website_url(str(row.get("link") or ""))
    host = (urlsplit(link).hostname or "").lower()
    if not name or host not in {"www.google.com", "google.com", "www.google.com.br", "google.com.br", "maps.google.com"}:
        return None
    address = row.get("complete_address") or {}
    address = address if isinstance(address, dict) else {}
    city, region, country = str(address.get("city") or ""), str(address.get("state") or ""), str(address.get("country") or "")
    if country and normalized(country) not in {"br", "brasil", "brazil"}:
        return None
    state = region.upper() if region.upper() in STATES else next((uf for uf, label in STATES.items() if normalized(label) == normalized(region)), "")
    if (city and normalized(city) != normalized(request.city)) or (state and state != request.state):
        return None
    try:
        latitude, longitude = float(row["latitude"]), float(row.get("longitude", row.get("longtitude")))
        if not math.isfinite(latitude) or not math.isfinite(longitude) or not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            return None
        if not point_in_geometry(longitude, latitude, location["geojson"]):
            return None
    except (KeyError, TypeError, ValueError):
        return None
    identifier = str(row.get("place_id") or row.get("cid") or hashlib.sha256(link.encode()).hexdigest())[:200]
    item = Candidate(provider_id="maps:"+identifier, company=name, city=request.city, state=request.state, location_status="observed",
                     address=str(row.get("address") or "")[:500], description=str(row.get("description") or "")[:1000])
    item.evidence.append(Evidence(field="company",value=name,url=link,source="Google Maps — gosom",observed_at=observed_at))
    item.evidence.append(Evidence(field="city",value=request.city,url=link,source="Coordenada publicada no Maps dentro do contorno municipal Nominatim",observed_at=observed_at))
    for field, value in {"phone":phone_number(str(row.get("phone") or "")),"website":website_url(str(row.get("web_site") or row.get("website") or "")),"address":item.address}.items():
        item.observe(field,value,link,"Google Maps — gosom",observed_at)
    item.listing = {"place_id":identifier,"category":str(row.get("category") or "")[:150],"latitude":latitude,"longitude":longitude,"url":link,"status":str(row.get("status") or "")[:100]}
    try:
        rating, count = float(row.get("review_rating", 0)), int(row.get("review_count", 0))
        if math.isfinite(rating) and 0 <= rating <= 5 and 0 <= count <= 10_000_000:
            item.listing.update(rating=rating,review_count=count)
    except (TypeError, ValueError, OverflowError):
        pass
    return item


async def discover_maps(request, http):
    params = {"city":request.city,"state":STATES[request.state],"country":"Brazil","countrycodes":"br","format":"jsonv2","addressdetails":1,"polygon_geojson":1,"limit":1}
    locations = await http.json("GET","https://nominatim.openstreetmap.org/search",params=params)
    if not isinstance(locations,list) or not locations or not isinstance(locations[0],dict):
        raise SourceError("Município não localizado para a pesquisa Maps.")
    location=locations[0];address=location.get("address",{})
    if not isinstance(address,dict):
        raise SourceError("Endereço municipal inválido na fonte geográfica.")
    if address.get("country_code")!="br" or (address.get("ISO3166-2-lvl4") and address["ISO3166-2-lvl4"]!="BR-"+request.state):
        raise SourceError("A localização retornada não corresponde ao município/UF solicitado.")
    if address.get("state") and normalized(address["state"])!=normalized(STATES[request.state]):
        raise SourceError("A fonte geográfica retornou outra UF para a pesquisa Maps.")
    locality=next((address.get(key) for key in ("city","town","village","municipality") if address.get(key)),"")
    if locality and normalized(locality)!=normalized(request.city):
        raise SourceError("A fonte geográfica retornou outro município para a pesquisa Maps.")
    try:
        latitude,longitude=float(location["lat"]),float(location["lon"])
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError()
        point_in_geometry(longitude,latitude,location["geojson"])
    except (KeyError,TypeError,ValueError) as exc:
        raise SourceError("Contorno/coordenadas municipais indisponíveis para a pesquisa Maps.") from exc
    context=http.discovery_context.get()
    state=(context['state'] if context else {}).setdefault('maps',{})
    save=context['save'] if context else lambda:None
    if not state.get('plan'):
        state.update(version=1,plan=await asyncio.to_thread(plan_queries,request,location,http.settings.osm_index_path,http.settings.maps_query_limit),seen=[],stop_reason=None)
        save()
    seen=set(state.get('seen',[]));last_error=None;failures=0
    known={item['provider_id']:{field:item.get(field,'') for field in ('phone','website','address')} for item in context['job']['candidates']} if context else {}
    for step in state['plan']:
        if step.get('status')=='completed':
            http.count('maps_steps_reused');continue
        if len(seen)>=300:
            state['stop_reason']='candidate_budget';save();break
        step.update(status='running',started_at=now(),received=0)
        state['current']=step['id'];state['stop_reason']=None;save()
        key='maps-v4:'+hashlib.sha256(json.dumps([step['term'],request.city,request.state,request.limit,step['coordinates'],step['zoom']],ensure_ascii=False).encode()).hexdigest()
        cached=http.store.cache_get(key)
        if cached and not cached.get('complete',True) and not cache_satisfies(cached['rows'],request,location,cached['observed_at']):cached=None
        observed_at=cached['observed_at'] if cached else now()
        async def events():
            if cached:
                http.count('maps_cache_hits')
                yield 'batch',cached['rows']
                yield 'end',(cached['rows'],False)
            else:
                async with aclosing(source_batches(request,http,step,key,observed_at)) as source:
                    async for event in source:yield event
        try:
            async with aclosing(events()) as stream:
                async for kind,payload in stream:
                    if kind=='end':
                        rows,partial=payload
                        if partial:
                            raise SourceError('A consulta Maps foi interrompida; registros já encontrados foram preservados.')
                        if not cached:http.store.cache_put(key,{'rows':rows,'observed_at':observed_at},min(3600,http.settings.cache_ttl))
                        step.update(status='completed',completed_at=now());failures=0;save()
                        continue
                    http.count('maps_batches');candidates=[]
                    step['received']+=len(payload)
                    for row in payload:
                        item=listing_candidate(row,request,location,observed_at)
                        if item is None:continue
                        if item.provider_id in seen:
                            http.count('maps_duplicates')
                            previous=known.get(item.provider_id,{})
                            if any(getattr(item,field) and not previous.get(field) for field in ('phone','website','address')):candidates.append(item)
                            continue
                        if len(seen)>=300:break
                        item.provider_rank=len(seen);seen.add(item.provider_id);candidates.append(item)
                    if candidates:
                        yield candidates
                        for item in candidates:
                            previous=known.setdefault(item.provider_id,{})
                            for field in ('phone','website','address'):
                                if getattr(item,field) and not previous.get(field):previous[field]=getattr(item,field)
                    # A etapa só é reconhecida depois que o consumidor salvou
                    # os candidatos. Um crash pode repetir a etapa incompleta,
                    # mas nunca perde registros por marcá-la antes de recebê-los.
                    state['seen']=sorted(seen);save()
                    if len(seen)>=300:
                        state['stop_reason']='candidate_budget';break
        except MapsBlocked:
            step['status']='blocked';state['stop_reason']='blocked';save();raise
        except SourceError as exc:
            step.update(status='failed',error=str(exc));last_error=exc;failures+=1
            http.count('maps_partial');save()
            if failures>=2:break
        finally:
            if step['status']=='running':
                reached=bool(context and len(context['job'].get('results',[]))>=request.limit)
                step['status']='limit_reached' if reached else 'interrupted'
                state['stop_reason']='limit_reached' if reached else state.get('stop_reason') or 'interrupted'
                with suppress(LeaseLost):save()
    state['current']=None
    state['stop_reason']=state.get('stop_reason') or ('source_interrupted' if last_error else 'plan_completed')
    save()
    if last_error:raise last_error
