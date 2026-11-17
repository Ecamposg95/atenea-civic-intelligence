"""Migration 0022_captura_sma on SQLite: adds columns, flags existing rows as
legacy, and is idempotent (second run is a no-op that doesn't re-flag)."""
import importlib.util
import os

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

_PATH = os.path.join(os.path.dirname(__file__), "..", "alembic", "versions", "0022_captura_sma.py")


def _load():
    spec = importlib.util.spec_from_file_location("m0022", _PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run(engine, fn):
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            fn()


def test_0022_upgrade_idempotente_y_legacy():
    mod = _load()
    assert mod.down_revision == "0021_campaign_municipio"
    engine = sa.create_engine("sqlite://")
    with engine.begin() as c:
        c.execute(sa.text("CREATE TABLE registros (id VARCHAR(36) PRIMARY KEY, nombre_completo VARCHAR(255))"))
        c.execute(sa.text("INSERT INTO registros VALUES ('a', 'VIEJO')"))
    _run(engine, mod.upgrade)
    insp = sa.inspect(engine)
    cols = {c["name"] for c in insp.get_columns("registros")}
    for col in ("tipo", "padre_id", "apellido_paterno", "apellido_materno", "nombres", "calle",
                "numero", "clave_hash", "hoja_id", "legacy", "curp_enc", "curp_masked", "curp_hash"):
        assert col in cols
    idx = {i["name"] for i in insp.get_indexes("registros")}
    assert {"ix_registros_padre_id", "ix_registros_clave_hash", "ix_registros_hoja_id",
            "ix_registros_curp_hash"} <= idx
    with engine.begin() as c:
        assert c.execute(sa.text("SELECT legacy FROM registros WHERE id='a'")).scalar() == 1
        c.execute(sa.text("INSERT INTO registros (id, nombre_completo) VALUES ('b', 'NUEVO')"))
        assert c.execute(sa.text("SELECT legacy FROM registros WHERE id='b'")).scalar() == 0
    _run(engine, mod.upgrade)  # idempotent: no error, no re-flag
    with engine.begin() as c:
        assert c.execute(sa.text("SELECT legacy FROM registros WHERE id='b'")).scalar() == 0
    _run(engine, mod.downgrade)
    assert "legacy" not in {c["name"] for c in sa.inspect(engine).get_columns("registros")}
