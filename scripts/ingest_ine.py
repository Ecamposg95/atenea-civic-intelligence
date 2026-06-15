#!/usr/bin/env python
"""CLI to consume INE data sources and ingest into Ágora.

Examples:
  # List configured sources
  python scripts/ingest_ine.py catalog

  # Search the datos.gob.mx (CKAN) catalog
  python scripts/ingest_ine.py datasets --q "lista nominal"

  # Ingest a GeoJSON cartography URL into electoral_areas for an org (by slug)
  python scripts/ingest_ine.py cartografia \
      --org atlas --level distrito_federal \
      --url https://example.org/distritos.geojson \
      --name-prop NOMBRE --code-prop CLAVE

  # Fetch a Candidaturas MX collection (areas/persons/organizations/posts)
  python scripts/ingest_ine.py candidaturas --collection areas

  # Download + parse a PREP/Cómputos results ZIP
  python scripts/ingest_ine.py prep --url https://.../resultados.zip --limit 5
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import delete as sa_delete, select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.integrations.ine import candidaturas, cartografia, ckan, prep  # noqa: E402
from app.integrations.ine.config import SOURCES, map_level  # noqa: E402
from app.models.electoral_area import ElectoralArea  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.services.ine_service import ingest_feature_collection  # noqa: E402


def cmd_catalog(_: argparse.Namespace) -> None:
    for s in SOURCES:
        print(f"- [{s.kind:8}] {s.id:18} {s.name}")
        print(f"      {s.base_url}  formats={s.formats} auth={s.auth_required}")


def cmd_datasets(args: argparse.Namespace) -> None:
    result = ckan.search_ine_datasets(args.q, rows=args.rows)
    for ds in result.get("results", []):
        fmts = sorted({r.get("format", "") for r in ds.get("resources", []) if r.get("format")})
        print(f"- {ds.get('title')}  [{', '.join(fmts)}]")


def cmd_cartografia(args: argparse.Namespace) -> None:
    fc = cartografia.fetch_geojson(args.url)
    # Optional client-side filter (e.g. keep only one state's municipios from a
    # nationwide GeoJSON): --filter-prop NAME_1 --filter-value "México".
    if args.filter_prop and args.filter_value is not None:
        feats = fc.get("features", [])
        kept = [
            f for f in feats
            if str((f.get("properties") or {}).get(args.filter_prop)) == args.filter_value
        ]
        print(f"Filtered {len(feats)} → {len(kept)} features where "
              f"{args.filter_prop}={args.filter_value!r}")
        fc = {**fc, "features": kept}
    with SessionLocal() as db:
        org = db.execute(
            select(Organization).where(Organization.slug == args.org)
        ).scalar_one_or_none()
        if org is None:
            sys.exit(f"Organization with slug '{args.org}' not found. Seed it first.")
        if args.replace:
            lvl = map_level(args.level)
            deleted = db.execute(
                sa_delete(ElectoralArea).where(
                    ElectoralArea.organization_id == org.id,
                    ElectoralArea.level == lvl,
                )
            ).rowcount
            db.commit()
            print(f"Replace: deleted {deleted} existing level={lvl.value} areas for '{args.org}'")
        count = ingest_feature_collection(
            db,
            organization_id=org.id,
            feature_collection=fc,
            level=args.level,
            name_prop=args.name_prop,
            code_prop=args.code_prop,
        )
    print(f"✓ Ingested {count} areas (level={args.level}) into org '{args.org}'")


def cmd_candidaturas(args: argparse.Namespace) -> None:
    dispatch = {
        "areas": candidaturas.list_areas,
        "persons": candidaturas.list_persons,
        "organizations": candidaturas.list_organizations,
        "posts": candidaturas.list_posts,
    }
    fn = dispatch.get(args.collection)
    if fn is None:
        sys.exit(f"Unknown collection. Choose from {sorted(dispatch)}")
    print(json.dumps(fn(), ensure_ascii=False, indent=2)[: args.max_chars])


def cmd_prep(args: argparse.Namespace) -> None:
    rows = prep.fetch_results(args.url, member=args.member)
    print(f"Parsed {len(rows)} rows. First {args.limit}:")
    for row in rows[: args.limit]:
        print(json.dumps(row, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest INE data into Ágora")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("catalog", help="List configured sources").set_defaults(func=cmd_catalog)

    p_ds = sub.add_parser("datasets", help="Search CKAN datasets")
    p_ds.add_argument("--q", default="")
    p_ds.add_argument("--rows", type=int, default=20)
    p_ds.set_defaults(func=cmd_datasets)

    p_cart = sub.add_parser("cartografia", help="Ingest GeoJSON into electoral_areas")
    p_cart.add_argument("--org", required=True, help="Organization slug")
    p_cart.add_argument("--url", required=True, help="GeoJSON FeatureCollection URL")
    p_cart.add_argument("--level", default="distrito_federal")
    p_cart.add_argument("--name-prop", dest="name_prop", default="NOMBRE")
    p_cart.add_argument("--code-prop", dest="code_prop", default="CLAVE")
    p_cart.add_argument("--filter-prop", dest="filter_prop", default=None,
                        help="Property to filter features by (e.g. NAME_1)")
    p_cart.add_argument("--filter-value", dest="filter_value", default=None,
                        help="Keep only features whose --filter-prop equals this")
    p_cart.add_argument("--replace", action="store_true",
                        help="Delete existing areas of this org+level before inserting")
    p_cart.set_defaults(func=cmd_cartografia)

    p_cand = sub.add_parser("candidaturas", help="Fetch Candidaturas MX collection")
    p_cand.add_argument("--collection", default="areas")
    p_cand.add_argument("--max-chars", dest="max_chars", type=int, default=4000)
    p_cand.set_defaults(func=cmd_candidaturas)

    p_prep = sub.add_parser("prep", help="Download + parse PREP/Cómputos results")
    p_prep.add_argument("--url", required=True)
    p_prep.add_argument("--member", default=None, help="CSV member inside the ZIP")
    p_prep.add_argument("--limit", type=int, default=5)
    p_prep.set_defaults(func=cmd_prep)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
