"""CLI local: siembra (o con --reset borra) la operación sintética de Atizapán.
Requiere SEED_DEMO_ATIZAPAN=true y la org/campaña ya sembradas. Nunca imprime PII."""
import argparse
import sys

from app.database import SessionLocal
from app.seeds import demo_atizapan_operacion as op


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()
    with SessionLocal() as db:
        camp = op._campaign(db)
        if camp is None:
            print("campaña de Atizapán no encontrada (¿SEED_DEMO_ATIZAPAN?)", file=sys.stderr)
            return 2
        if args.reset:
            print(op.reset_operacion(db, camp))
            return 0
        print("sembrado" if op.seed_atizapan_operacion(db) else "ya estaba sembrado / gate apagado")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
