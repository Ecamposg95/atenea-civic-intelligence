#!/usr/bin/env python
"""Seed a local SQLite database with demo users for the UI walkthrough.

Run with DATABASE_URL pointing at a SQLite file (see local run instructions).
Creates the PostGIS-free tables (organizations, users, audit_logs) and a set of
demo accounts whose passwords are pre-set (no forced change), so you can log in
and explore the UI immediately.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402

DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "Demo12345")

# Hardcoded demo password for the activist hierarchy (local dev only).
_ACTIVIST_PW = "78451289"

DEMO_USERS = [
    ("admin@agora.gob.mx", "Admin Demo", UserRole.ADMIN),
    ("ana.analista@agora.gob.mx", "Ana Analista", UserRole.ANALYST),
    ("victor.viewer@agora.gob.mx", "Víctor Viewer", UserRole.VIEWER),
    ("sofia.admin@agora.gob.mx", "Sofía Admin", UserRole.ADMIN),
]

# Activist hierarchy seeded with hardcoded local-dev passwords.
# (email, full_name, role, password)
LEADERSHIP_USERS = [
    # Lucy is COORDINADOR (top of the activist hierarchy).
    ("lucy@atlastech.mx", "Lucy — Coordinadora de Activismo", UserRole.COORDINADOR, _ACTIVIST_PW),
    # A LIDER under lucy (coordinador_id resolved at seed time).
    ("lider@atlastech.mx", "Líder Demo", UserRole.LIDER, _ACTIVIST_PW),
    # A CAPTURISTA (no hierarchy FKs).
    ("capturista@atlastech.mx", "Capturista Demo", UserRole.CAPTURISTA, _ACTIVIST_PW),
]

# Activist user seeded under the lider (lider_id resolved at seed time).
# (email, full_name, role, password)
ACTIVIST_USERS = [
    ("activista@atlastech.mx", "Activista Demo", UserRole.ACTIVISTA, _ACTIVIST_PW),
]


def main() -> None:
    # Only the SQLite-safe tables (electoral_areas uses PostGIS geometry).
    Base.metadata.create_all(
        engine,
        tables=[Organization.__table__, User.__table__, AuditLog.__table__],
    )
    with SessionLocal() as db:
        org = db.execute(
            select(Organization).where(Organization.slug == "atlas")
        ).scalar_one_or_none()
        if org is None:
            org = Organization(name="Atlas Tech", slug="atlas")
            db.add(org)
            db.flush()

        for email, name, role in DEMO_USERS:
            exists = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
            if exists is None:
                db.add(
                    User(
                        email=email,
                        full_name=name,
                        role=role,
                        organization_id=org.id,
                        hashed_password=hash_password(DEMO_PASSWORD),
                        must_change_password=False,
                        is_active=True,
                    )
                )

        # Seed lucy (COORDINADOR) first — other hierarchy users reference her.
        lucy_row = next((u for u in LEADERSHIP_USERS if u[2] == UserRole.COORDINADOR), None)
        if lucy_row:
            lucy_email, lucy_name, lucy_role, lucy_pw = lucy_row
            lucy = db.execute(select(User).where(User.email == lucy_email)).scalar_one_or_none()
            if lucy is None:
                lucy = User(
                    email=lucy_email,
                    full_name=lucy_name,
                    role=lucy_role,
                    organization_id=org.id,
                    hashed_password=hash_password(lucy_pw),
                    must_change_password=False,
                    is_active=True,
                )
                db.add(lucy)
            else:
                # Promote to COORDINADOR if still at legacy LIDER role.
                lucy.role = UserRole.COORDINADOR
                lucy.lider_id = None
                lucy.coordinador_id = None
            db.flush()
        else:
            lucy = None

        # Seed the LIDER (coordinador_id = lucy.id).
        lider_row = next((u for u in LEADERSHIP_USERS if u[2] == UserRole.LIDER), None)
        lider = None
        if lider_row and lucy:
            lider_email, lider_name, lider_role, lider_pw = lider_row
            lider = db.execute(select(User).where(User.email == lider_email)).scalar_one_or_none()
            if lider is None:
                lider = User(
                    email=lider_email,
                    full_name=lider_name,
                    role=lider_role,
                    organization_id=org.id,
                    coordinador_id=lucy.id,
                    hashed_password=hash_password(lider_pw),
                    must_change_password=False,
                    is_active=True,
                )
                db.add(lider)
            else:
                lider.coordinador_id = lucy.id
            db.flush()

        # Seed the CAPTURISTA (no hierarchy FKs).
        cap_row = next((u for u in LEADERSHIP_USERS if u[2] == UserRole.CAPTURISTA), None)
        if cap_row:
            cap_email, cap_name, cap_role, cap_pw = cap_row
            cap_exists = db.execute(select(User).where(User.email == cap_email)).scalar_one_or_none()
            if cap_exists is None:
                db.add(
                    User(
                        email=cap_email,
                        full_name=cap_name,
                        role=cap_role,
                        organization_id=org.id,
                        hashed_password=hash_password(cap_pw),
                        must_change_password=False,
                        is_active=True,
                    )
                )
            db.flush()

        # Seed the ACTIVISTA (lider_id = lider.id).
        for email, name, role, password in ACTIVIST_USERS:
            exists = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
            if exists is None:
                db.add(
                    User(
                        email=email,
                        full_name=name,
                        role=role,
                        organization_id=org.id,
                        lider_id=lider.id if lider else None,
                        hashed_password=hash_password(password),
                        must_change_password=False,
                        is_active=True,
                        seccion="0001",
                    )
                )
            else:
                # Re-wire activista if pointing at old lucy (legacy wiring).
                if lider and exists.lider_id != lider.id:
                    exists.lider_id = lider.id

        db.commit()

    print("Seed complete")
    print(f"  Login: admin@agora.gob.mx / {DEMO_PASSWORD}  (rol admin)")
    print(f"  Login: lucy@atlastech.mx / {_ACTIVIST_PW}  (rol coordinador — coordinadora de activismo)")
    print(f"  Login: lider@atlastech.mx / {_ACTIVIST_PW}  (rol lider — bajo lucy)")
    print(f"  Login: activista@atlastech.mx / {_ACTIVIST_PW}  (rol activista — bajo lider)")
    print(f"  Login: capturista@atlastech.mx / {_ACTIVIST_PW}  (rol capturista)")


if __name__ == "__main__":
    main()
