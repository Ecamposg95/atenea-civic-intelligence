#!/usr/bin/env python
"""Backfill ``clave_hash`` on registros that have an encrypted clave but no hash.

Migration 0022 added ``clave_hash`` without computing it for pre-existing rows
(that requires Fernet decryption, which must not run inside a migration). Run
this once after deploying 0022 so duplicate detection in the paper-sheet
capture also matches "valores viejos" by clave.

Never prints a clave — only counts.

  python scripts/backfill_hashes.py            # dry run (counts only)
  python scripts/backfill_hashes.py --apply    # write hashes

Requires DATABASE_URL, FERNET_KEY and SECRET_KEY (same values as the app).
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import select  # noqa: E402

from app.core import crypto  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.registro import Registro  # noqa: E402

BATCH = 500


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = ap.parse_args()

    crypto.ensure_crypto_ready()
    db = SessionLocal()
    pendientes = actualizados = fallidos = 0
    try:
        q = select(Registro).where(
            Registro.clave_elector_enc.is_not(None), Registro.clave_hash.is_(None)
        )
        for reg in db.execute(q).scalars().yield_per(BATCH):
            pendientes += 1
            try:
                plain = crypto.decrypt_clave(reg.clave_elector_enc)
            except Exception:  # undecryptable row (wrong key / corrupt) — skip, never log value
                fallidos += 1
                continue
            if args.apply:
                reg.clave_hash = crypto.hash_clave(plain)
                actualizados += 1
                if actualizados % BATCH == 0:
                    db.flush()
        if args.apply:
            db.commit()
    finally:
        db.close()

    modo = "APLICADO" if args.apply else "SIMULACIÓN"
    print(f"[{modo}] pendientes={pendientes} actualizados={actualizados} fallidos={fallidos}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
