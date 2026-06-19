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
from app.models.organization import Organization
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
    ini_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
    cfg = Config(ini_path)

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


def run_bootstrap() -> None:
    """Run the full idempotent bootstrap sequence."""
    _wait_for_db()
    _enable_postgis()   # must run BEFORE _migrate so the geometry type exists
    _migrate()
    _seed()
    logger.info("Database bootstrap complete")
