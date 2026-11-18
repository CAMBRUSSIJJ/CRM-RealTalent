"""Build a minimal, provenance-bearing QSA index for companies already selected.

Official Receita Federal Socios ZIP: headerless Latin-1, semicolon CSV.
Do not ingest CPF (including masked CPF), representative documents, age,
personal contact details, nationality or unverified 'decision maker' labels.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from tempfile import TemporaryDirectory

from .company_index_import import SOURCE_URL, date_field, source_rows

QSA_COLUMNS = (
    "cnpj_basic", "partner_key", "partner_name", "partner_type",
    "role_code", "role_label", "joined_on", "source_month", "source_url",
)
PARTNER_KINDS = {"1": "Pessoa jurídica", "2": "Pessoa física", "3": "Estrangeiro"}
ROOT_PATTERN = re.compile(r"^[0-9]{8}$")
ROLE_PATTERN = re.compile(r"^[0-9]{2}$")
MONTH_PATTERN = re.compile(r"^20[0-9]{2}-(?:0[1-9]|1[0-2])$")


def role_dictionary(paths):
    result = {}
    for row in source_rows(paths):
        if len(row) < 2:
            continue
        code, title = row[0].strip(), row[1].strip()
        if ROLE_PATTERN.fullmatch(code) and title:
            result[code] = title[:140]
    if not result:
        raise ValueError("A tabela Qualificacoes da Receita não contém códigos válidos.")
    return result


def parse_qsa(row, roles):
    """Return only the organizational relationship; never copy the raw document."""
    if len(row) < 11:
        return None
    root = row[0].strip()
    kind = row[1].strip()
    name = " ".join(row[2].strip().split())[:180]
    role = row[4].strip().zfill(2)
    if not ROOT_PATTERN.fullmatch(root) or kind not in PARTNER_KINDS:
        return None
    if not name or name.replace("*", "").strip() == "" or not ROLE_PATTERN.fullmatch(role):
        return None
    joined = date_field(row[5].strip())
    # Stable across monthly refresh; no CPF used for the identity key.
    key = hashlib.sha256(
        "\x1f".join((root, kind, name.casefold(), role, joined)).encode("utf-8")
    ).hexdigest()[:32]
    return (root, key, name, PARTNER_KINDS[kind], role,
            roles.get(role, "Qualificação " + role), joined)


def prepare_qsa(*, company_csv, socios, qualificacoes, month, output):
    if not MONTH_PATTERN.fullmatch(month):
        raise ValueError("Informe --month AAAA-MM da mesma competência do índice de empresas.")
    company_csv, output = Path(company_csv), Path(output)
    if not company_csv.is_file():
        raise ValueError("O arquivo CSV de empresas selecionadas não foi encontrado.")
    if company_csv.resolve() == output.resolve():
        raise ValueError("Os arquivos de saída QSA e de empresas precisam ser diferentes.")
    roles = role_dictionary(qualificacoes)
    with TemporaryDirectory(prefix="realtalent-qsa-") as temp:
        db = sqlite3.connect(str(Path(temp) / "selected.sqlite3"))
        try:
            db.execute("create table roots (root text primary key)")
            db.execute("""create table people (
              cnpj_basic text, partner_key text, partner_name text, partner_type text,
              role_code text, role_label text, joined_on text,
              primary key(cnpj_basic,partner_key))""")
            # A SQLite disk index keeps memory use bounded even for all RS companies.
            with company_csv.open(encoding="utf-8", newline="") as input_file:
                reader = csv.DictReader(input_file)
                if not {"cnpj", "source_month"}.issubset(reader.fieldnames or []):
                    raise ValueError("O CSV de empresas não possui CNPJ e competência.")
                for row in reader:
                    cnpj = (row.get("cnpj") or "").strip()
                    source_month = (row.get("source_month") or "").strip()
                    if source_month != month + "-01":
                        raise ValueError("O mês do QSA precisa coincidir com o CSV de empresas.")
                    if re.fullmatch(r"[0-9]{14}", cnpj):
                        db.execute("insert or ignore into roots values (?)", (cnpj[:8],))
            db.commit()
            total_roots = db.execute("select count(*) from roots").fetchone()[0]
            if not total_roots:
                raise ValueError("Nenhuma raiz de CNPJ válida no recorte empresarial.")
            scanned = selected = 0
            for row in source_rows(socios):
                scanned += 1
                person = parse_qsa(row, roles)
                if not person:
                    continue
                if not db.execute("select 1 from roots where root=?", (person[0],)).fetchone():
                    continue
                cursor = db.execute(
                    "insert or ignore into people values (?,?,?,?,?,?,?)", person
                )
                if cursor.rowcount:
                    selected += 1
            db.commit()
            output.parent.mkdir(parents=True, exist_ok=True)
            with output.open("w", encoding="utf-8", newline="") as target:
                writer = csv.writer(target)
                writer.writerow(QSA_COLUMNS)
                for person in db.execute("""select cnpj_basic,partner_key,partner_name,
                     partner_type,role_code,role_label,joined_on
                     from people order by cnpj_basic,role_code,partner_name"""):
                    writer.writerow((*person, month + "-01", SOURCE_URL))
        finally:
            db.close()
    return {
        "source_month": month, "selected_company_roots": total_roots,
        "scanned_qsa_rows": scanned, "exported_people": selected,
        "destination": str(output),
        "privacy": "Nomes e vínculos do QSA; nenhum CPF, documento pessoal, telefone ou faixa etária.",
        "coverage_warning": (
            "Só foram exportados vínculos das empresas no CSV selecionado. "
            "Ausência no arquivo não significa ausência de sócios."
        ),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Exportar QSA mínimo para o índice RealTalent RS")
    parser.add_argument("--companies-csv", required=True, help="CSV produzido pelo importador CNPJ do mesmo mês")
    parser.add_argument("--socios", nargs="+", required=True, help="Todos os Socios*.zip do mesmo mês")
    parser.add_argument("--qualificacoes", nargs="+", required=True, help="Qualificacoes.zip do mesmo mês")
    parser.add_argument("--month", required=True, help="Competência AAAA-MM")
    parser.add_argument("--output", required=True, help="CSV QSA, sem documentos pessoais")
    args = parser.parse_args(argv)
    print(json.dumps(prepare_qsa(company_csv=args.companies_csv, socios=args.socios,
          qualificacoes=args.qualificacoes, month=args.month, output=args.output),
          ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
