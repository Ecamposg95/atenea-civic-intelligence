"""One-off prod setup for the Atención Ciudadana follow-up (2026-07).

Does TWO things, idempotently, in a single transaction:

  1. COUNTDOWN — activates the electoral countdown on the main dashboard by
     ensuring the Cargo exists and creating a Contest (with ``election_date``)
     for the demo campaign, *if the campaign has no contest yet*. Default date
     is 2027-06-06 (primer domingo de junio — jornada electoral 2027, LGIPE
     art. 25). The dashboard countdown reads ``min(Contest.election_date)``.

  2. SEED CLEANUP — deletes the smoke-test seed: the form definition (matched by
     campaign + slug), its responses, and any casos (+ their eventos) that
     originated from those responses. Nothing else is touched.

SAFE BY DEFAULT: runs as a DRY RUN and only prints what it *would* do. Pass
``--apply`` (or ``APPLY=1``) to actually commit.

The database must be reachable via ``DATABASE_URL``. Railway's private host
(``*.railway.internal``) is NOT reachable from your laptop — use the Postgres
service's **public** proxy URL (Railway dashboard → Postgres → Connect → Public
Networking), e.g.:

    DATABASE_URL='postgresql://USER:PASS@HOST:PORT/DB' \\
        python scripts/setup_election_2027.py            # dry run (safe preview)

    DATABASE_URL='postgresql://USER:PASS@HOST:PORT/DB' \\
        python scripts/setup_election_2027.py --apply    # commit

Overridable via env: CAMPAIGN_ID, ELECTION_DATE (YYYY-MM-DD), FORM_SLUG,
CARGO_KEY. Skip either half with COUNTDOWN=0 or CLEANUP=0.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from datetime import date  # noqa: E402

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.atencion import Caso, CasoEvento, FormDefinition, FormResponse  # noqa: E402
from app.models.campaign import Campaign, Contest  # noqa: E402
from app.models.catalog import Ambito, Cargo  # noqa: E402

# --- config (env-overridable) ------------------------------------------------
CAMPAIGN_ID = os.environ.get("CAMPAIGN_ID", "616b72dd-268a-42d9-8c66-008a0780cda8")
ELECTION_DATE = os.environ.get("ELECTION_DATE", "2027-06-06")
FORM_SLUG = os.environ.get("FORM_SLUG", "peticion-ciudadana")
CARGO_KEY = os.environ.get("CARGO_KEY", "presidencia_municipal")
DO_COUNTDOWN = os.environ.get("COUNTDOWN", "1") != "0"
DO_CLEANUP = os.environ.get("CLEANUP", "1") != "0"
APPLY = "--apply" in sys.argv or os.environ.get("APPLY") == "1"

# Canonical cargos, mirroring scripts/seed_catalogs.py. San Mateo Atenco is a
# municipal context, so the default is the ayuntamiento. Any cargo activates the
# countdown equally — this only labels which race the contest represents.
CANONICAL_CARGOS = {
    "presidencia": ("Presidencia de la República", Ambito.FEDERAL, "nation"),
    "gubernatura": ("Gubernatura", Ambito.ESTATAL, "estado"),
    "dip_federal": ("Diputación Federal", Ambito.FEDERAL, "distrito_federal"),
    "dip_local": ("Diputación Local", Ambito.ESTATAL, "distrito_local"),
    "presidencia_municipal": ("Presidencia Municipal", Ambito.MUNICIPAL, "municipio"),
}


def _in(ids):
    # Guard against an empty IN () clause (SQLAlchemy warns + it is a no-match).
    return ids if ids else {"__none__"}


def main() -> int:
    try:
        y, m, d = (int(p) for p in ELECTION_DATE.split("-"))
        eday = date(y, m, d)
    except ValueError:
        print(f"ABORT: ELECTION_DATE '{ELECTION_DATE}' is not YYYY-MM-DD")
        return 2

    if CARGO_KEY not in CANONICAL_CARGOS:
        print(f"ABORT: CARGO_KEY '{CARGO_KEY}' unknown. Options: {list(CANONICAL_CARGOS)}")
        return 2

    db = SessionLocal()
    try:
        campaign = db.get(Campaign, CAMPAIGN_ID)
        if campaign is None:
            print(f"ABORT: campaign {CAMPAIGN_ID} not found")
            return 1
        print(f"Campaign: {campaign.name!r}  (org={campaign.organization_id})")
        print(f"Mode: {'APPLY (will commit)' if APPLY else 'DRY RUN (no writes)'}\n")

        # --- 1. countdown ---------------------------------------------------
        if DO_COUNTDOWN:
            label, ambito, level = CANONICAL_CARGOS[CARGO_KEY]
            cargo = db.execute(select(Cargo).where(Cargo.key == CARGO_KEY)).scalar_one_or_none()
            if cargo is None:
                print(f"[countdown] cargo {CARGO_KEY!r} missing -> CREATE ({label})")
                cargo = Cargo(key=CARGO_KEY, label=label, ambito=ambito, territory_level=level)
                db.add(cargo)
                db.flush()
            else:
                print(f"[countdown] cargo {CARGO_KEY!r} exists ({cargo.id})")

            contests = db.execute(
                select(Contest).where(
                    Contest.campaign_id == CAMPAIGN_ID, Contest.deleted_at.is_(None)
                )
            ).scalars().all()
            dated = [c for c in contests if c.election_date]
            if dated:
                print(f"[countdown] already active: election_date(s)={[str(c.election_date) for c in dated]} -> no change")
            elif contests:
                print(f"[countdown] {len(contests)} contest(s) exist with NULL date -> SET election_date={eday}")
                for c in contests:
                    c.election_date = eday
            else:
                print(f"[countdown] no contest -> CREATE contest cargo={CARGO_KEY} election_date={eday}")
                db.add(Contest(
                    organization_id=campaign.organization_id,
                    campaign_id=CAMPAIGN_ID,
                    cargo_id=cargo.id,
                    election_date=eday,
                ))
        else:
            print("[countdown] skipped (COUNTDOWN=0)")

        # --- 2. seed cleanup ------------------------------------------------
        if DO_CLEANUP:
            forms = db.execute(select(FormDefinition).where(
                FormDefinition.campaign_id == CAMPAIGN_ID,
                FormDefinition.slug == FORM_SLUG,
            )).scalars().all()
            if not forms:
                print(f"[cleanup] no form with slug {FORM_SLUG!r} in this campaign -> nothing to delete")
            for f in forms:
                resps = db.execute(select(FormResponse).where(
                    FormResponse.form_definition_id == f.id)).scalars().all()
                resp_ids = {r.id for r in resps}
                caso_ids = {r.caso_id for r in resps if r.caso_id}
                casos = db.execute(select(Caso).where(
                    Caso.id.in_(_in(caso_ids))
                    | Caso.origin_response_id.in_(_in(resp_ids))
                )).scalars().all()
                caso_ids_all = {c.id for c in casos}
                eventos = db.execute(select(CasoEvento).where(
                    CasoEvento.caso_id.in_(_in(caso_ids_all)))).scalars().all()
                print(f"[cleanup] form {f.slug!r} ({f.id}): "
                      f"{len(resps)} response(s), {len(casos)} caso(s), {len(eventos)} evento(s) -> DELETE")
                # explicit, ordered delete (does not rely on DB-level cascade)
                for ev in eventos:
                    db.delete(ev)
                for c in casos:
                    db.delete(c)
                for r in resps:
                    db.delete(r)
                db.delete(f)
        else:
            print("[cleanup] skipped (CLEANUP=0)")

        if APPLY:
            db.commit()
            print("\nAPPLIED — changes committed.")
        else:
            db.rollback()
            print("\nDRY RUN — nothing committed. Re-run with --apply to commit.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
