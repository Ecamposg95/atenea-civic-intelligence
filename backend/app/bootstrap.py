"""Idempotent database bootstrap.

Runs at application startup (FastAPI lifespan) and is also callable from
``scripts/railway_init.py`` for local/manual use.

On Railway the bootstrap MUST run at runtime (not in the Nixpacks ``release``
phase): private networking — and therefore ``*.railway.internal`` DNS — is only
available once the service is running, so a release-phase connection to the
database fails with "Name or service not known".

Steps (all idempotent, safe to run on every boot):
  1. Wait for the database to accept connections (handles cold-start races).
  2. Enable the PostGIS extension (PostgreSQL only) — required before the
     ``electoral_areas`` table with its ``Geometry`` column can be created.
  3. Run Alembic migrations to head (Postgres) or create_all (SQLite/other).
  4. Seed a base organization and a super-admin user if absent.

Seed credentials come from env (never hardcoded):
  SEED_ORG_NAME, SEED_ORG_SLUG, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
"""

import os
import time

from sqlalchemy import inspect, select, text
from sqlalchemy.exc import OperationalError

import app.models  # noqa: F401  (register models on Base.metadata)
from app.core.logging import get_logger
from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models.campaign import Campaign, CampaignMembership
from app.models.organization import Organization
from app.models.privacy import PrivacyNotice
from app.models.user import User, UserRole

logger = get_logger("agora.bootstrap")


def _wait_for_db(max_attempts: int = 20, delay_seconds: float = 3.0) -> None:
    """Block until the database accepts a connection, or give up after retries."""
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError as exc:
            logger.warning(
                "Database not ready (attempt %s/%s): %s",
                attempt,
                max_attempts,
                exc,
            )
            if attempt == max_attempts:
                raise
            time.sleep(delay_seconds)


def _enable_postgis() -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    logger.info("PostGIS extension ensured")


def _migrate() -> None:
    """Run Alembic migrations to head on Postgres; fall back to create_all elsewhere.

    On a fresh Postgres database ``upgrade head`` runs 0001 → 0002 → 0003 in sequence.

    Legacy production databases (bootstrapped via create_all before Alembic was
    introduced) have all base tables but no ``alembic_version`` row.  We detect
    this by checking whether ``organizations`` exists without ``alembic_version``
    and automatically stamp the DB at revision 0001 (the baseline that matches
    what create_all produced) before running ``upgrade head``.
    """
    if engine.dialect.name != "postgresql":
        Base.metadata.create_all(engine)
        logger.info("Tables ensured (create_all, non-postgres)")
        return

    from alembic import command
    from alembic.config import Config

    # alembic.ini lives one directory above this file (backend/alembic.ini).
    backend_dir = os.path.dirname(os.path.dirname(__file__))  # /app/backend
    ini_path = os.path.join(backend_dir, "alembic.ini")
    cfg = Config(ini_path)
    # script_location in alembic.ini is relative and is otherwise resolved against
    # the CWD (which is /app at runtime via `uvicorn --app-dir backend`), so the
    # scripts dir would be looked up at /app/alembic and not found. Pin it absolute.
    cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))

    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    has_organizations = "organizations" in existing_tables
    has_alembic_version = "alembic_version" in existing_tables

    if has_organizations and not has_alembic_version:
        # Pre-Alembic production DB: schema matches baseline 0001.
        # Stamp it so upgrade head applies only the delta revisions.
        logger.info(
            "Detected pre-Alembic production DB (organizations table exists, "
            "no alembic_version). Stamping at revision 0001."
        )
        command.stamp(cfg, "0001")
    elif not has_organizations:
        logger.info("Fresh database — running full upgrade head.")
    else:
        logger.info("Alembic-managed database — running upgrade head.")

    command.upgrade(cfg, "head")
    logger.info("Alembic migrated to head")


def _seed() -> None:
    org_name = os.getenv("SEED_ORG_NAME", "Atlas Tech")
    org_slug = os.getenv("SEED_ORG_SLUG", "atlas")
    admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@atlas.gov")
    admin_password = os.getenv("SEED_ADMIN_PASSWORD")

    with SessionLocal() as db:
        org = db.execute(
            select(Organization).where(Organization.slug == org_slug)
        ).scalar_one_or_none()
        if org is None:
            org = Organization(name=org_name, slug=org_slug)
            db.add(org)
            db.flush()
            logger.info("Seeded organization '%s'", org_slug)

        existing = db.execute(
            select(User).where(User.email == admin_email)
        ).scalar_one_or_none()
        if existing is None:
            if not admin_password:
                logger.warning(
                    "SEED_ADMIN_PASSWORD not set — skipping super-admin seed. "
                    "Set it to create the initial admin."
                )
            else:
                db.add(
                    User(
                        email=admin_email,
                        full_name="Super Admin",
                        hashed_password=hash_password(admin_password),
                        role=UserRole.SUPERADMIN,
                        organization_id=org.id,
                    )
                )
                logger.info("Seeded super-admin '%s'", admin_email)
        db.commit()

    _seed_demo_activists()
    _seed_global_privacy_notice()


def _seed_demo_activists() -> None:
    """Idempotently seed a 4-level hierarchy for demo/local use.

    Structure (COORDINADOR → LIDER → ACTIVISTA + CAPTURISTA):
      lucy        = COORDINADOR  (no lider_id, no coordinador_id)
      lider       = LIDER        (coordinador_id = lucy.id)
      activista   = ACTIVISTA    (lider_id = lider.id)
      capturista  = CAPTURISTA   (no hierarchy FKs)

    Env-gated: skipped entirely when SEED_LUCY_PASSWORD or SEED_ACTIVISTA_PASSWORD
    is absent so no secrets are accidentally committed.  All steps are idempotent;
    re-running produces no duplicates and no errors.

    Transition logic: if lucy already exists as LIDER (legacy), her role is
    promoted to COORDINADOR and lider_id/coordinador_id are cleared.  If the
    activista already points to lucy (old wiring), she is re-wired to the new
    LIDER.

    Required env vars:
      SEED_LUCY_EMAIL            (default: lucy@demo.agora.mx)
      SEED_LUCY_PASSWORD         (required; no default — absent → skip)
      SEED_LIDER_EMAIL           (default: lider@demo.agora.mx)
      SEED_LIDER_PASSWORD        (default: SEED_ACTIVISTA_PASSWORD)
      SEED_ACTIVISTA_EMAIL       (default: activista@demo.agora.mx)
      SEED_ACTIVISTA_PASSWORD    (required; no default — absent → skip)
      SEED_CAPTURISTA_EMAIL      (default: capturista@demo.agora.mx)
      SEED_CAPTURISTA_PASSWORD   (optional — absent → capturista skipped)
      SEED_ORG_SLUG              (default: atlas — must match the org seeded by _seed)
      SEED_DEMO_CAMPAIGN_NAME    (default: Campaña Demo 2027)
    """
    lucy_email = os.getenv("SEED_LUCY_EMAIL", "lucy@demo.agora.mx")
    lucy_password = os.getenv("SEED_LUCY_PASSWORD")
    lider_email = os.getenv("SEED_LIDER_EMAIL", "lider@demo.agora.mx")
    activista_email = os.getenv("SEED_ACTIVISTA_EMAIL", "activista@demo.agora.mx")
    activista_password = os.getenv("SEED_ACTIVISTA_PASSWORD")
    lider_password = os.getenv("SEED_LIDER_PASSWORD") or activista_password
    capturista_email = os.getenv("SEED_CAPTURISTA_EMAIL", "capturista@demo.agora.mx")
    capturista_password = os.getenv("SEED_CAPTURISTA_PASSWORD")
    org_slug = os.getenv("SEED_ORG_SLUG", "atlas")
    campaign_name = os.getenv("SEED_DEMO_CAMPAIGN_NAME", "Campaña Demo 2027")

    if not lucy_password or not activista_password:
        logger.info(
            "SEED_LUCY_PASSWORD / SEED_ACTIVISTA_PASSWORD not set — "
            "skipping demo-activist seed (opt-in, set both to enable)."
        )
        return

    with SessionLocal() as db:
        # -- resolve org ----------------------------------------------------
        org = db.execute(
            select(Organization).where(Organization.slug == org_slug)
        ).scalar_one_or_none()
        if org is None:
            logger.warning(
                "Demo-activist seed: org with slug '%s' not found — skipping.", org_slug
            )
            return

        # -- demo campaign --------------------------------------------------
        campaign = db.execute(
            select(Campaign).where(
                Campaign.organization_id == org.id,
                Campaign.name == campaign_name,
            )
        ).scalar_one_or_none()
        if campaign is None:
            campaign = Campaign(
                name=campaign_name,
                cycle=2027,
                organization_id=org.id,
            )
            db.add(campaign)
            db.flush()
            logger.info("Seeded demo campaign '%s'", campaign_name)

        # -- lucy (COORDINADOR) --------------------------------------------
        lucy = db.execute(
            select(User).where(User.email == lucy_email)
        ).scalar_one_or_none()
        if lucy is None:
            lucy = User(
                email=lucy_email,
                full_name="Lucy — Coordinadora de Activismo",
                role=UserRole.COORDINADOR,
                organization_id=org.id,
                hashed_password=hash_password(lucy_password),
                is_active=True,
                must_change_password=False,
            )
            db.add(lucy)
            db.flush()
            logger.info("Seeded demo COORDINADOR '%s'", lucy_email)
        else:
            # Promote to COORDINADOR if still at legacy LIDER role.
            if lucy.role != UserRole.COORDINADOR:
                lucy.role = UserRole.COORDINADOR
                logger.info(
                    "Promoted existing '%s' from %s → COORDINADOR",
                    lucy_email, lucy.role.value,
                )
            # A coordinador has no upward FK.
            lucy.lider_id = None
            lucy.coordinador_id = None
            db.flush()

        # -- demo lider (LIDER under lucy) ---------------------------------
        lider = db.execute(
            select(User).where(User.email == lider_email)
        ).scalar_one_or_none()
        if lider is None:
            lider = User(
                email=lider_email,
                full_name="Líder Demo",
                role=UserRole.LIDER,
                organization_id=org.id,
                coordinador_id=lucy.id,
                hashed_password=hash_password(lider_password),
                is_active=True,
                must_change_password=False,
            )
            db.add(lider)
            db.flush()
            logger.info("Seeded demo LIDER '%s'", lider_email)
        else:
            if lider.coordinador_id != lucy.id:
                lider.coordinador_id = lucy.id
                db.flush()

        # -- activista (ACTIVISTA under the lider) -------------------------
        activista = db.execute(
            select(User).where(User.email == activista_email)
        ).scalar_one_or_none()
        if activista is None:
            activista = User(
                email=activista_email,
                full_name="Activista Demo",
                role=UserRole.ACTIVISTA,
                organization_id=org.id,
                lider_id=lider.id,
                hashed_password=hash_password(activista_password),
                is_active=True,
                must_change_password=False,
                seccion="0001",
            )
            db.add(activista)
            db.flush()
            logger.info("Seeded demo ACTIVISTA '%s'", activista_email)
        else:
            # Re-wire if still pointing at lucy (old structure).
            if activista.lider_id != lider.id:
                activista.lider_id = lider.id
                db.flush()

        # -- capturista (CAPTURISTA, no hierarchy FKs) ---------------------
        capturista = None
        if capturista_password:
            capturista = db.execute(
                select(User).where(User.email == capturista_email)
            ).scalar_one_or_none()
            if capturista is None:
                capturista = User(
                    email=capturista_email,
                    full_name="Capturista Demo",
                    role=UserRole.CAPTURISTA,
                    organization_id=org.id,
                    hashed_password=hash_password(capturista_password),
                    is_active=True,
                    must_change_password=False,
                )
                db.add(capturista)
                db.flush()
                logger.info("Seeded demo CAPTURISTA '%s'", capturista_email)
        else:
            logger.info(
                "SEED_CAPTURISTA_PASSWORD not set — skipping capturista seed."
            )

        # -- campaign memberships (idempotent by unique constraint) ---------
        seed_members = [
            (lucy, UserRole.COORDINADOR),
            (lider, UserRole.LIDER),
            (activista, UserRole.ACTIVISTA),
        ]
        if capturista is not None:
            seed_members.append((capturista, UserRole.CAPTURISTA))

        for user, mem_role in seed_members:
            existing_mem = db.execute(
                select(CampaignMembership).where(
                    CampaignMembership.user_id == user.id,
                    CampaignMembership.campaign_id == campaign.id,
                )
            ).scalar_one_or_none()
            if existing_mem is None:
                db.add(
                    CampaignMembership(
                        user_id=user.id,
                        campaign_id=campaign.id,
                        role=mem_role,
                    )
                )
                logger.info(
                    "Seeded campaign membership: %s → %s (%s)",
                    user.email, campaign_name, mem_role.value,
                )

        db.commit()


def _seed_global_privacy_notice() -> None:
    """Idempotently seed the global platform aviso de privacidad v1."""
    with SessionLocal() as db:
        existing = db.execute(
            select(PrivacyNotice).where(
                PrivacyNotice.organization_id.is_(None),
                PrivacyNotice.version == "v1",
            )
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                PrivacyNotice(
                    organization_id=None,
                    version="v1",
                    is_active=True,
                    body=(
                        "Aviso de Privacidad — versión 1.0\n\n"
                        "De conformidad con la Ley Federal de Protección de Datos "
                        "Personales en Posesión de los Particulares, sus datos personales "
                        "son recabados con fines de participación cívica y organización "
                        "electoral. El titular puede ejercer derechos ARCO ante el "
                        "responsable del tratamiento."
                    ),
                )
            )
            db.commit()
            logger.info("Seeded global privacy notice v1")
        else:
            logger.debug("Global privacy notice v1 already present — skipping")


def run_bootstrap() -> None:
    """Run the full idempotent bootstrap sequence."""
    _wait_for_db()
    _enable_postgis()   # must run BEFORE _migrate so the geometry type exists
    _migrate()
    _seed()
    logger.info("Database bootstrap complete")
