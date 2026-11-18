"""Prepare an auditable, minimised RS business index from official RFB CNPJ ZIPs.

No network, credentials or personal contact data. Reads RFB's headerless
semicolon-delimited Latin-1 files in a streaming fashion. Never guesses
municipality names or treats a capped pilot as a complete coverage report.
"""
import argparse
import csv
from datetime import datetime
import io
import json
from pathlib import Path
import re
import sqlite3
from tempfile import TemporaryDirectory
import unicodedata
import zipfile

SOURCE_URL = "https://www.gov.br/receitafederal/dados"
COLUMNS = ("cnpj", "legal_name", "trade_name", "name_search", "uf",
           "municipality_code", "city", "city_search", "main_cnae",
           "secondary_cnaes", "status", "opened_on", "headquarters",
           "source_month", "source_url")
CNPJ_PART = re.compile(r"^[0-9]{2,8}$")
CNAE = re.compile(r"^[0-9]{7}$")


def normal(value: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return " ".join(re.findall(r"[a-z0-9]+", ascii_text.lower()))


def source_rows(paths):
    for input_file in paths:
        path = Path(input_file)
        if not path.is_file():
            raise ValueError(f"Arquivo não encontrado: {path}")
        if path.suffix.lower() == ".zip":
            with zipfile.ZipFile(path) as archive:
                for member in archive.infolist():
                    if member.is_dir():
                        continue
                    with archive.open(member) as raw:
                        with io.TextIOWrapper(raw, encoding="latin-1", newline="") as stream:
                            yield from csv.reader(stream, delimiter=";", quotechar='"')
        else:
            with path.open(encoding="latin-1", newline="") as stream:
                yield from csv.reader(stream, delimiter=";", quotechar='"')


def loaded_municipalities(paths):
    towns = {}
    for row in source_rows(paths):
        if len(row) < 2 or not re.fullmatch(r"[0-9]{4}", row[0].strip()):
            continue
        code, title = row[0].strip(), row[1].strip()
        if title:
            towns[code] = title
    if not towns:
        raise ValueError("Tabela Municípios da Receita vazia. Não é código IBGE.")
    return towns


def date_field(value):
    if not re.fullmatch(r"[0-9]{8}", value or ""):
        return ""
    try:
        return datetime.strptime(value, "%Y%m%d").strftime("%Y-%m-%d")
    except ValueError:
        return ""


def process_establishment(row, municipalities, *, cnae_prefix="", include_inactive=False):
    if len(row) < 30 or row[19].strip() != "RS":
        return None
    status = row[5].strip().zfill(2)
    if not include_inactive and status != "02":
        return None
    municipality_code = row[20].strip().zfill(4)
    city = municipalities.get(municipality_code)
    if not city:
        return None
    root, order, check = row[0].strip(), row[1].strip(), row[2].strip()
    if not (root.isdigit() and order.isdigit() and check.isdigit()):
        return None
    cnpj = root.zfill(8) + order.zfill(4) + check.zfill(2)
    main = row[11].strip()
    if not CNAE.fullmatch(main):
        return None
    secondary = sorted({part.strip() for part in row[12].split(",") if CNAE.fullmatch(part.strip())})
    if cnae_prefix and not (main.startswith(cnae_prefix) or any(c.startswith(cnae_prefix) for c in secondary)):
        return None
    trade_name = row[4].strip()[:240]
    # Do not ingest RFB phone/email fields or personal shareholder details.
    return (cnpj, root.zfill(8), trade_name, "RS", municipality_code, city,
            normal(city), main, "{" + ",".join(secondary) + "}", status,
            date_field(row[10]), row[3].strip() == "1")


def prepare(*, establishments, companies, municipalities, month, output,
            cnae_prefix="", max_records=0, include_inactive=False):
    if not re.fullmatch(r"20[0-9]{2}-(?:0[1-9]|1[0-2])", month):
        raise ValueError("Informe --month como AAAA-MM da versão oficial.")
    if cnae_prefix and not re.fullmatch(r"[0-9]{2,7}", cnae_prefix):
        raise ValueError("O filtro CNAE deve conter de 2 a 7 dígitos.")
    if max_records < 0:
        raise ValueError("--max-records não pode ser negativo.")
    towns = loaded_municipalities(municipalities)
    with TemporaryDirectory(prefix="realtalent-index-") as workspace:
        db = sqlite3.connect(str(Path(workspace) / "rs.sqlite"))
        db.execute("""create table selected (
          cnpj text primary key, basic text not null, trade_name text,
          uf text, municipality_code text, city text, city_search text,
          main_cnae text, secondary_cnaes text, status text,
          opened_on text, headquarters integer, legal_name text default ''
        )""")
        db.execute("create index roots_idx on selected(basic)")
        scanned = selected = 0
        capped = False
        try:
            for row in source_rows(establishments):
                scanned += 1
                item = process_establishment(
                    row, towns, cnae_prefix=cnae_prefix,
                    include_inactive=include_inactive
                )
                if not item:
                    continue
                db.execute("""insert or ignore into selected(
                  cnpj,basic,trade_name,uf,municipality_code,city,
                  city_search,main_cnae,secondary_cnaes,status,
                  opened_on,headquarters) values (?,?,?,?,?,?,?,?,?,?,?,?)""", item)
                selected += 1
                if max_records and selected >= max_records:
                    capped = True
                    break
            db.commit()

            # Enterprise names are stored in another RFB file. Join only
            # selected roots; do not load the national enterprise table in RAM.
            matched_roots = 0
            for row in source_rows(companies):
                if len(row) < 2 or not row[0].strip().isdigit():
                    continue
                basic = row[0].strip().zfill(8)
                if not db.execute("select 1 from selected where basic=? limit 1", (basic,)).fetchone():
                    continue
                legal_name = row[1].strip()[:240]
                if legal_name:
                    db.execute("update selected set legal_name=? where basic=?", (legal_name, basic))
                    matched_roots += 1
            db.commit()

            destination = Path(output)
            destination.parent.mkdir(parents=True, exist_ok=True)
            exported = 0
            with destination.open("w", encoding="utf-8", newline="") as target:
                writer = csv.DictWriter(target, fieldnames=COLUMNS)
                writer.writeheader()
                for item in db.execute("""select cnpj, legal_name, trade_name, uf,
                     municipality_code, city, city_search, main_cnae,
                     secondary_cnaes, status, opened_on, headquarters
                     from selected order by cnpj"""):
                    (cnpj, legal_name, trade_name, uf, municipality_code,
                     city, city_search, main, secondary, status, opened, hq) = item
                    if not legal_name:
                        # Never invent the corporate name from the trade name.
                        continue
                    writer.writerow({
                        "cnpj": cnpj, "legal_name": legal_name,
                        "trade_name": trade_name,
                        "name_search": normal(legal_name + " " + trade_name),
                        "uf": uf, "municipality_code": municipality_code,
                        "city": city, "city_search": city_search,
                        "main_cnae": main, "secondary_cnaes": secondary,
                        "status": status, "opened_on": opened,
                        "headquarters": "true" if hq else "false",
                        "source_month": month + "-01", "source_url": SOURCE_URL,
                    })
                    exported += 1
        finally:
            db.close()
    return {"scanned_establishments": scanned, "selected_rs": selected,
            "matched_company_roots": matched_roots, "exported": exported,
            "partial_sample": capped, "source_month": month,
            "destination": str(output),
            "warning": "Amostra limitada; não representa cobertura completa do RS." if capped else ""}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Gerar índice empresarial RS a partir dos ZIPs oficiais do CNPJ")
    parser.add_argument("--estabelecimentos", nargs="+", required=True, help="Todos os Estabelecimentos*.zip da competência")
    parser.add_argument("--empresas", nargs="+", required=True, help="Todos os Empresas*.zip da mesma competência")
    parser.add_argument("--municipios", nargs="+", required=True, help="Municipios.zip da Receita (não IBGE)")
    parser.add_argument("--month", required=True, help="Competência AAAA-MM dos arquivos")
    parser.add_argument("--output", required=True, help="CSV para importar com COPY no PostgreSQL")
    parser.add_argument("--cnae-prefix", default="", help="Ex.: 85 para educação")
    parser.add_argument("--max-records", type=int, default=0, help="Limite para amostra; zero para percorrer tudo")
    parser.add_argument("--include-inactive", action="store_true")
    args = parser.parse_args(argv)
    result = prepare(establishments=args.estabelecimentos, companies=args.empresas,
                     municipalities=args.municipios, month=args.month, output=args.output,
                     cnae_prefix=args.cnae_prefix, max_records=args.max_records,
                     include_inactive=args.include_inactive)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
