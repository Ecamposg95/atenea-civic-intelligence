"""SP0a spine: new catalog/campaign tables, electoral_areas expansion.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-18

Changes introduced in SP0a:
- New global-reference tables: cargos, parties, coalitions, coalition_parties.
- New campaign tables: campaigns, contests, campaign_memberships.
- electoral_areas:
    - organization_id made nullable (shared global cartography).
    - Six self-referential FK hierarchy columns added (parent_id, estado_id, ...).
    - area_level enum extended with 9 new Mexican electoral hierarchy values.

NOTE -- downgrade limitations:
  PostgreSQL does not support removing values from an existing enum type.
  ``downgrade()`` drops the new tables and columns, but the extra area_level
  values added in this revision (nation, estado, municipio, ...) will remain in
  the PG type.  This is harmless for re-running upgrade() (IF NOT EXISTS guards),
  but an operator who needs a clean enum must recreate it manually.
"""

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None
# ---------------------------------------------------------------------------

# Enum labels are the SQLAlchemy member *names* (uppercase) to match the app's
# default Enum(PyEnum) mapping and the create_all-built production schema.
_NEW_AREA_LEVEL_VALUES = (
    "NATION",
    "ESTADO",
    "MUNICIPIO",
    "DISTRITO_FEDERAL",
    "DISTRITO_LOCAL",
    "SECCION",
    "COLONIA",
    "MANZANA",
    "CASILLA",
)

_USER_ROLE_VALUES = ("SUPERADMIN", "ADMIN", "ANALYST", "VIEWER")
_CARGO_AMBITO_VALUES = ("FEDERAL", "ESTATAL", "MUNICIPAL")
_CAMPAIGN_STATUS_VALUES = ("DRAFT", "ACTIVE", "CLOSED")
_LICENSE_TIER_VALUES = ("STANDARD", "PRO", "ENTERPRISE")


def _now_default(is_pg: bool) -> sa.sql.expression.TextClause:
    """Dialect-portable server default for CURRENT TIMESTAMP."""
    return sa.text("now()") if is_pg else sa.text("(datetime('now'))")


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    now = _now_default(is_pg)

    from sqlalchemy import inspect as sa_inspect
    insp = sa_inspect(bind)
    existing_tables = set(insp.get_table_names())

    def _enum_col(values, name):
        """Enum column type that NEVER auto-creates its PG type inside create_table.

        The enum types are created explicitly (checkfirst=True) below.  Passing a
        generic ``sa.Enum(create_type=False)`` to ``op.create_table`` does NOT
        suppress the implicit ``CREATE TYPE`` on Postgres (an alembic quirk —
        unlike ``metadata.create_all``), so on a clean baseline schema the type
        ends up created twice → ``DuplicateObject``.  ``postgresql.ENUM`` honours
        ``create_type=False`` correctly; on SQLite fall back to ``sa.Enum`` (which
        renders as VARCHAR — no separate type object exists).
        """
        if is_pg:
            from sqlalchemy.dialects import postgresql
            return postgresql.ENUM(*values, name=name, create_type=False)
        return sa.Enum(*values, name=name)

    def _table_exists(name: str) -> bool:
        return name in existing_tables

    def _column_exists(table: str, column: str) -> bool:
        if table not in existing_tables:
            return False
        return any(c["name"] == column for c in insp.get_columns(table))

    def _index_exists(table: str, name: str) -> bool:
        # NOTE: on Postgres a failed statement poisons the whole transaction, so
        # we must NEVER attempt a create_index that could collide (e.g. when a
        # legacy create_all schema already has the index).  Pre-check by name —
        # the same pattern used in 0004/0005 — instead of try/except, which
        # swallows the Python error but leaves the transaction aborted, breaking
        # alembic's own final ``UPDATE alembic_version``.
        if table not in existing_tables:
            return False
        return any(ix["name"] == name for ix in insp.get_indexes(table))

    # ── Create new enums (Postgres only) ─────────────────────────────────────
    if is_pg:
        sa.Enum(*_CARGO_AMBITO_VALUES, name="cargo_ambito").create(bind, checkfirst=True)
        sa.Enum(*_CAMPAIGN_STATUS_VALUES, name="campaign_status").create(bind, checkfirst=True)
        sa.Enum(*_LICENSE_TIER_VALUES, name="license_tier").create(bind, checkfirst=True)

    # ── cargos ────────────────────────────────────────────────────────────────
    if not _table_exists("cargos"):
        op.create_table(
            "cargos",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("key", sa.String(60), nullable=False),
            sa.Column("label", sa.String(120), nullable=False),
            sa.Column(
                "ambito",
                _enum_col(_CARGO_AMBITO_VALUES, "cargo_ambito"),
                nullable=False,
            ),
            sa.Column("territory_level", sa.String(40), nullable=False),
        )
    if not _index_exists("cargos", "ix_cargos_key"):
        op.create_index("ix_cargos_key", "cargos", ["key"], unique=True)

    # ── parties ───────────────────────────────────────────────────────────────
    if not _table_exists("parties"):
        op.create_table(
            "parties",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("key", sa.String(40), nullable=False),
            sa.Column("name", sa.String(160), nullable=False),
            sa.Column("short", sa.String(40), nullable=False),
            sa.Column("color", sa.String(9), nullable=False, server_default="#8ba0a8"),
        )
    if not _index_exists("parties", "ix_parties_key"):
        op.create_index("ix_parties_key", "parties", ["key"], unique=True)

    # ── coalitions ────────────────────────────────────────────────────────────
    if not _table_exists("coalitions"):
        op.create_table(
            "coalitions",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("key", sa.String(40), nullable=False),
            sa.Column("name", sa.String(160), nullable=False),
            sa.Column("color", sa.String(9), nullable=False, server_default="#8ba0a8"),
        )
    if not _index_exists("coalitions", "ix_coalitions_key"):
        op.create_index("ix_coalitions_key", "coalitions", ["key"], unique=True)

    # ── coalition_parties ─────────────────────────────────────────────────────
    if not _table_exists("coalition_parties"):
        op.create_table(
            "coalition_parties",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column(
                "coalition_id",
                sa.String(36),
                sa.ForeignKey("coalitions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "party_id",
                sa.String(36),
                sa.ForeignKey("parties.id", ondelete="CASCADE"),
                nullable=False,
            ),
        )
    if not _index_exists("coalition_parties", "ix_coalition_parties_coalition_id"):
        op.create_index("ix_coalition_parties_coalition_id", "coalition_parties", ["coalition_id"])
    if not _index_exists("coalition_parties", "ix_coalition_parties_party_id"):
        op.create_index("ix_coalition_parties_party_id", "coalition_parties", ["party_id"])

    # ── campaigns ─────────────────────────────────────────────────────────────
    if not _table_exists("campaigns"):
        op.create_table(
            "campaigns",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column(
                "organization_id",
                sa.String(36),
                sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("cycle", sa.Integer(), nullable=False),
            sa.Column(
                "status",
                _enum_col(_CAMPAIGN_STATUS_VALUES, "campaign_status"),
                nullable=False,
                server_default="DRAFT",
            ),
            sa.Column(
                "license_tier",
                _enum_col(_LICENSE_TIER_VALUES, "license_tier"),
                nullable=False,
                server_default="STANDARD",
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(36), nullable=True),
            sa.Column("updated_by", sa.String(36), nullable=True),
        )
    if not _index_exists("campaigns", "ix_campaigns_organization_id"):
        op.create_index("ix_campaigns_organization_id", "campaigns", ["organization_id"])

    # ── contests ──────────────────────────────────────────────────────────────
    if not _table_exists("contests"):
        op.create_table(
            "contests",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column(
                "organization_id",
                sa.String(36),
                sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "campaign_id",
                sa.String(36),
                sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "cargo_id",
                sa.String(36),
                sa.ForeignKey("cargos.id"),
                nullable=False,
            ),
            sa.Column(
                "territory_id",
                sa.String(36),
                sa.ForeignKey("electoral_areas.id"),
                nullable=True,
            ),
            sa.Column("election_date", sa.Date(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(36), nullable=True),
            sa.Column("updated_by", sa.String(36), nullable=True),
        )
    if not _index_exists("contests", "ix_contests_organization_id"):
        op.create_index("ix_contests_organization_id", "contests", ["organization_id"])
    if not _index_exists("contests", "ix_contests_campaign_id"):
        op.create_index("ix_contests_campaign_id", "contests", ["campaign_id"])
    if not _index_exists("contests", "ix_contests_cargo_id"):
        op.create_index("ix_contests_cargo_id", "contests", ["cargo_id"])
    if not _index_exists("contests", "ix_contests_territory_id"):
        op.create_index("ix_contests_territory_id", "contests", ["territory_id"])

    # ── campaign_memberships ──────────────────────────────────────────────────
    if not _table_exists("campaign_memberships"):
        op.create_table(
            "campaign_memberships",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column(
                "user_id",
                sa.String(36),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "campaign_id",
                sa.String(36),
                sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
                nullable=False,
            ),
            # Reuses the user_role PG enum created in 0001 -- must NOT recreate it.
            sa.Column(
                "role",
                _enum_col(_USER_ROLE_VALUES, "user_role"),
                nullable=False,
                server_default="VIEWER",
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(36), nullable=True),
            sa.Column("updated_by", sa.String(36), nullable=True),
            sa.UniqueConstraint("user_id", "campaign_id", name="uq_campaign_member"),
        )
    if not _index_exists("campaign_memberships", "ix_campaign_memberships_user_id"):
        op.create_index("ix_campaign_memberships_user_id", "campaign_memberships", ["user_id"])
    if not _index_exists("campaign_memberships", "ix_campaign_memberships_campaign_id"):
        op.create_index(
            "ix_campaign_memberships_campaign_id", "campaign_memberships", ["campaign_id"]
        )

    # ── electoral_areas: hierarchy columns ────────────────────────────────────
    # SQLite does not support ADD COLUMN ... REFERENCES ... (FK constraints via
    # ALTER TABLE).  We add the columns as plain nullable VARCHAR on SQLite; the
    # FK constraints exist only on Postgres where they are enforced.
    def _fk_args(ref: str):
        """Return FK args only when on Postgres."""
        if is_pg:
            return [sa.ForeignKey(ref, ondelete="SET NULL")]
        return []

    for col_name in (
        "parent_id",
        "estado_id",
        "municipio_id",
        "distrito_federal_id",
        "distrito_local_id",
        "seccion_id",
    ):
        if not _column_exists("electoral_areas", col_name):
            op.add_column(
                "electoral_areas",
                sa.Column(col_name, sa.String(36), *_fk_args("electoral_areas.id"), nullable=True),
            )
        if not _index_exists("electoral_areas", f"ix_electoral_areas_{col_name}"):
            op.create_index(
                f"ix_electoral_areas_{col_name}", "electoral_areas", [col_name]
            )

    # ── electoral_areas: make organization_id nullable ────────────────────────
    # SQLite does not support ALTER COLUMN to change nullability.  On SQLite,
    # NOT NULL is not strictly enforced without CHECK constraints, and the column
    # was already created nullable-capable; skip the ALTER on non-Postgres.
    if is_pg:
        op.alter_column(
            "electoral_areas",
            "organization_id",
            existing_type=sa.String(36),
            nullable=True,
        )

    # ── area_level enum extension ─────────────────────────────────────────────
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction on Postgres.
    # This is handled in the NEXT revision (0003_area_level_values.py) which
    # uses an autocommit block.  Nothing to do here.

    # ── data migration: promote cartography to global (no org binding) ────────
    # Rows with the OLD English level names that represent shared geographic
    # reference data are unbound from any tenant.  (New Spanish-named rows are
    # inserted already null via the API; this covers legacy seeds.)
    # Guard: only run on Postgres — on SQLite the ALTER COLUMN to nullable is
    # skipped above, so organization_id remains NOT NULL and setting it to NULL
    # would violate the constraint on any non-empty SQLite DB.
    if is_pg:
        # Compare via ``level::text`` rather than enum literals.  A legacy
        # production DB bootstrapped by create_all built the area_level enum
        # from the Python member *names* (uppercase: STATE/MUNICIPALITY), while
        # an alembic-built DB uses the lowercase *values* (0001's
        # _OLD_AREA_LEVEL_VALUES).  A bare ``level IN ('state','municipality')``
        # raises "invalid input value for enum area_level" when those exact
        # lowercase labels are absent — which would crash this migration on the
        # create_all schema.  The text cast never raises for an absent label and
        # the case-folded IN list promotes legacy cartography regardless of how
        # the enum was originally created.
        op.execute(
            sa.text(
                "UPDATE electoral_areas "
                "SET organization_id = NULL "
                "WHERE lower(level::text) IN ('state', 'municipality')"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # ── drop new tables (reverse FK order) ────────────────────────────────────
    op.drop_table("campaign_memberships")
    op.drop_table("contests")
    op.drop_table("campaigns")
    op.drop_table("coalition_parties")
    op.drop_table("coalitions")
    op.drop_table("parties")
    op.drop_table("cargos")

    # ── drop hierarchy columns from electoral_areas ───────────────────────────
    op.drop_index("ix_electoral_areas_seccion_id", table_name="electoral_areas")
    op.drop_column("electoral_areas", "seccion_id")
    op.drop_index("ix_electoral_areas_distrito_local_id", table_name="electoral_areas")
    op.drop_column("electoral_areas", "distrito_local_id")
    op.drop_index("ix_electoral_areas_distrito_federal_id", table_name="electoral_areas")
    op.drop_column("electoral_areas", "distrito_federal_id")
    op.drop_index("ix_electoral_areas_municipio_id", table_name="electoral_areas")
    op.drop_column("electoral_areas", "municipio_id")
    op.drop_index("ix_electoral_areas_estado_id", table_name="electoral_areas")
    op.drop_column("electoral_areas", "estado_id")
    op.drop_index("ix_electoral_areas_parent_id", table_name="electoral_areas")
    op.drop_column("electoral_areas", "parent_id")

    # ── organization_id nullability ───────────────────────────────────────────
    # We do NOT revert organization_id back to NOT NULL here.  After the upgrade
    # data migration, rows may have organization_id = NULL; attempting ALTER to
    # NOT NULL would fail with a constraint violation.  Leaving it nullable on
    # downgrade is harmless: 0001 defined it NOT NULL only for the initial DDL,
    # and a full downgrade to base (dropping all tables) erases the column anyway.

    # ── drop new PG enums ─────────────────────────────────────────────────────
    if is_pg:
        sa.Enum(name="license_tier").drop(bind, checkfirst=True)
        sa.Enum(name="campaign_status").drop(bind, checkfirst=True)
        sa.Enum(name="cargo_ambito").drop(bind, checkfirst=True)
        # NOTE: area_level extra values (nation, estado, municipio, ...) cannot be
        # removed from an existing PG enum type via DDL.  They remain harmlessly.
