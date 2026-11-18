import argparse
import asyncio
from contextlib import suppress
import json
from pathlib import Path
import sys

from pydantic import ValidationError

from .config import Settings
from .engine import Engine
from .models import SearchRequest
from .network import HTTP, SourceError
from .providers import OSM_TAGS, SEGMENTS, validate_provider
from .osm_index import build_index
from .store import Store, public_job


async def search(args, settings, request=None, checkpoint=None):
    if request is None:
        request = SearchRequest(segment=args.segment, city=args.city, state=args.state,
                            provider=args.provider, limit=args.limit, require_phone=args.require_phone,
                            require_email=args.require_email, require_observed_location=args.require_location,
                            minimum_relevance=args.min_relevance,
                            enrich_websites=not args.no_websites,search_mode=args.search_mode)
        request.qualify = args.qualify
    store = Store(settings.db_path)
    http = HTTP(settings, store)
    try:
        validate_provider(request, http)
        job = store.create(request,seed_checkpoint=checkpoint,parent_job_id=checkpoint['id'] if checkpoint else None)
        print("Pesquisa " + job["id"] + " iniciada.", file=sys.stderr)
        task=asyncio.create_task(Engine(http,store).run_one(job['id']))
        async def report_progress():
            previous=None
            while not task.done():
                current=store.get(job['id']);values=(current['discovered'],len(current['results']))
                if values!=previous:
                    print(f"Progresso: {values[0]} empresas encontradas; {values[1]} resultados úteis.",file=sys.stderr);previous=values
                await asyncio.sleep(0.5)
        progress=asyncio.create_task(report_progress()) if args.progress else None
        try:document=await task
        finally:
            if progress:
                progress.cancel()
                with suppress(asyncio.CancelledError):await progress
        write_json(args.output, document["results"])
        if args.report:
            write_json(args.report, public_job(document))
        if args.pending_output:
            write_json(args.pending_output, document.get("pending", []))
        print(f"Estado: {document['status']}; empresas descobertas: {document['discovered']}; resultados: {len(document['results'])}.", file=sys.stderr)
        metrics = document.get("metrics", {})
        print(f"Consultas à fonte: {metrics.get('discovery_requests', 0)}; acessos a sites: {metrics.get('website_requests', 0)}; descartes: {sum(metrics.get('rejected', {}).values())}.", file=sys.stderr)
        if document["error"]:
            print(document["error"], file=sys.stderr)
        for warning in document["warnings"]:
            print(warning, file=sys.stderr)
        return 0 if document["status"] == "completed" else 2
    finally:
        await http.close()


def write_json(path: str, data):
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if path == "-":
        sys.stdout.write(serialized)
    else:
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(destination.name + ".tmp")
        temporary.write_text(serialized, encoding="utf-8")
        temporary.replace(destination)


def main():
    parser = argparse.ArgumentParser(description="Motor de descoberta de empresas do Garimpo")
    commands = parser.add_subparsers(dest="command", required=True)
    find = commands.add_parser("search", help="Pesquisar e exportar JSON compatível com o Garimpo")
    find.add_argument("--segment", required=True)
    find.add_argument("--city", required=True)
    find.add_argument("--state", required=True, help="UF brasileira")
    find.add_argument("--provider", choices=["auto", "osm", "brave", "hybrid", "maps", "combined"], default="auto")
    find.add_argument("--qualify", action="store_true", help="Qualificar sinais publicados com Ollama configurado no servidor")
    find.add_argument('--search-mode',choices=['standard','expanded'],default='expanded')
    find.add_argument('--progress',action='store_true',help='Exibir resultados progressivos no terminal')
    find.add_argument("--limit", type=int, default=25)
    find.add_argument("--require-phone", action="store_true")
    find.add_argument("--require-email", action="store_true")
    find.add_argument("--require-location", action="store_true", help="Exigir cidade observada no endereço da fonte")
    find.add_argument("--min-relevance", type=int, default=0, help="Correspondência mínima com o segmento, entre 0 e 100")
    find.add_argument("--no-websites", action="store_true")
    find.add_argument("--output", default="-", help="Arquivo JSON ou - para stdout")
    find.add_argument("--report", help="Arquivo com estado, contadores e avisos")
    find.add_argument("--pending-output", help="Arquivo JSON separado com candidatos cujo contato está pendente")
    resume=commands.add_parser('resume',help='Retomar uma pesquisa interrompida aproveitando etapas concluídas')
    resume.add_argument('job_id')
    resume.add_argument('--output',default='-')
    resume.add_argument('--report')
    resume.add_argument('--pending-output')
    resume.add_argument('--progress',action='store_true')
    commands.add_parser("segments", help="Listar categorias da busca OpenStreetMap")
    setup = commands.add_parser("setup-maps", help="Instalar o coletor Maps fixado e verificar sua integridade")
    setup.add_argument("--directory",default="data/tools")
    index = commands.add_parser("index-osm", help="Preparar uma base própria a partir de uma extração OSM/PBF")
    index.add_argument("--input", required=True)
    index.add_argument("--output", required=True)
    index.add_argument("--source-url", required=True)
    index.add_argument("--snapshot-at", required=True, help="Data da extração, em ISO 8601 com fuso")
    index.add_argument("--bounds", nargs=4, type=float, metavar=("WEST", "SOUTH", "EAST", "NORTH"))
    index.add_argument("--label", default="Base OpenStreetMap")
    index.add_argument("--states", nargs="+", help="UFs cobertas pelo arquivo, por exemplo RS SC PR")
    status = commands.add_parser("status", help="Consultar uma pesquisa persistida")
    status.add_argument("job_id")
    serve = commands.add_parser("serve", help="Iniciar API e fila persistente")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    try:
        settings = Settings.from_env()
        if args.command == "setup-maps":
            from .maps_setup import setup_maps
            print(setup_maps(Path(args.directory)))
            return 0
        if args.command in {'search','resume'}:
            paths = [Path(path).resolve() for path in (args.output, args.report, args.pending_output) if path and path != "-"]
            if len(paths) != len(set(paths)):
                raise ValueError("Resultados, pendentes e relatório devem ter caminhos diferentes.")
            if args.command=='resume':
                original=Store(settings.db_path).get(args.job_id)
                if original is None or not public_job(original)['can_resume']:
                    raise ValueError('Pesquisa inexistente ou sem interrupção pendente de retomada.')
                return asyncio.run(search(args,settings,SearchRequest.model_validate(original['request']),original))
            return asyncio.run(search(args, settings))
        if args.command == "index-osm":
            info = build_index(Path(args.input), Path(args.output), source_url=args.source_url,
                               snapshot_at=args.snapshot_at, categories={pair for tags in OSM_TAGS.values() for pair in tags},
                               bounds=args.bounds, label=args.label, states=args.states)
            write_json("-", info)
            return 0
        if args.command == "segments":
            write_json("-", [aliases[0] for aliases, _ in SEGMENTS])
            return 0
        if args.command == "status":
            job = Store(settings.db_path).get(args.job_id)
            if job is None:
                raise ValueError("Pesquisa não encontrada.")
            write_json("-", public_job(job))
            return 0
        from .api import create_app
        import uvicorn
        uvicorn.run(create_app(settings), host=args.host, port=args.port, access_log=False)
        return 0
    except (ValueError, ValidationError, SourceError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
