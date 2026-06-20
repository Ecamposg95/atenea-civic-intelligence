# backend/tests/test_sp0b2b_migration.py
import os
import tempfile

import sqlalchemy as sa
from alembic import command
from alembic.config import Config


def _cfg(url):
    bd = os.path.join(os.path.dirname(__file__), "..")
    cfg = Config(os.path.join(bd, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(bd, "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def test_alembic_roundtrip_0007():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    url = f"sqlite:///{path}"
    os.environ["DATABASE_URL"] = url

    # Patch settings.DATABASE_URL so env.py reads the temp url at runtime
    import app.core.config as _cfg_mod
    original_db_url = _cfg_mod.settings.DATABASE_URL
    _cfg_mod.settings.DATABASE_URL = url

    try:
        cfg = _cfg(url)
        command.upgrade(cfg, "head")
        e = sa.create_engine(url)
        with e.connect() as c:
            assert (
                c.execute(sa.text("SELECT version_num FROM alembic_version")).scalar()
                == "0007"
            )
            insp = sa.inspect(e)
            for t in ("election_results", "socio_metrics", "economic_units"):
                assert t in insp.get_table_names()
        command.downgrade(cfg, "0006")
        command.upgrade(cfg, "head")
    finally:
        _cfg_mod.settings.DATABASE_URL = original_db_url
        os.remove(path)
