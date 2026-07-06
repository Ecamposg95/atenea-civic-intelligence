"""0016 atencion ciudadana — form_definitions, form_responses, casos, caso_eventos

Revision ID: 0016_atencion
Revises: 0015_militantes
"""
from alembic import op
import sqlalchemy as sa

revision = "0016_atencion"
down_revision = "0015_militantes"
branch_labels = None
depends_on = None


def _insp():
    return sa.inspect(op.get_bind())


def _table_exists(name: str) -> bool:
    return name in _insp().get_table_names()


def _index_exists(table: str, name: str) -> bool:
    if not _table_exists(table):
        return False
    return any(ix["name"] == name for ix in _insp().get_indexes(table))


def upgrade() -> None:
    if not _table_exists("form_definitions"):
        op.create_table(
            "form_definitions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("campaign_id", sa.String(36), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("nombre", sa.String(200), nullable=False),
            sa.Column("descripcion", sa.String(1000), nullable=True),
            sa.Column("tipo", sa.String(20), nullable=False, server_default="PETICION"),
            sa.Column("slug", sa.String(80), nullable=False),
            sa.Column("canal", sa.String(20), nullable=False, server_default="INTERNO"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("schema", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(36), nullable=True),
            sa.Column("updated_by", sa.String(36), nullable=True),
        )
    if not _index_exists("form_definitions", "ix_form_definitions_campaign_active"):
        op.create_index("ix_form_definitions_campaign_active", "form_definitions", ["campaign_id", "is_active"])
    if not _index_exists("form_definitions", "uq_form_definitions_campaign_slug"):
        op.create_index("uq_form_definitions_campaign_slug", "form_definitions", ["campaign_id", "slug"], unique=True)

    if not _table_exists("form_responses"):
        op.create_table(
            "form_responses",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("campaign_id", sa.String(36), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("form_definition_id", sa.String(36), sa.ForeignKey("form_definitions.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("answers", sa.JSON(), nullable=False),
            sa.Column("answers_enc", sa.LargeBinary(), nullable=True),
            sa.Column("channel", sa.String(20), nullable=False, server_default="INTERNO"),
            sa.Column("captured_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("nombre_emisor", sa.String(255), nullable=True),
            sa.Column("contacto_masked", sa.String(40), nullable=True),
            sa.Column("seccion", sa.String(20), nullable=True),
            sa.Column("evidencia_keys", sa.JSON(), nullable=True),
            sa.Column("moderacion", sa.String(20), nullable=False, server_default="VERIFICADO"),
            sa.Column("caso_id", sa.String(36), nullable=True, index=True),
            sa.Column("client_uuid", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(36), nullable=True),
            sa.Column("updated_by", sa.String(36), nullable=True),
        )
    if not _index_exists("form_responses", "ix_form_responses_campaign_def"):
        op.create_index("ix_form_responses_campaign_def", "form_responses", ["campaign_id", "form_definition_id"])

    if not _table_exists("casos"):
        op.create_table(
            "casos",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("campaign_id", sa.String(36), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("folio", sa.String(40), nullable=False),
            sa.Column("origin_response_id", sa.String(36), nullable=True),
            sa.Column("tipo", sa.String(20), nullable=False, server_default="PETICION"),
            sa.Column("titulo", sa.String(255), nullable=False),
            sa.Column("descripcion", sa.String(2000), nullable=True),
            sa.Column("ciudadano_nombre", sa.String(255), nullable=True),
            sa.Column("contacto_enc", sa.LargeBinary(), nullable=True),
            sa.Column("contacto_masked", sa.String(40), nullable=True),
            sa.Column("seccion", sa.String(20), nullable=True),
            sa.Column("colonia", sa.String(255), nullable=True),
            sa.Column("area_id", sa.String(36), sa.ForeignKey("electoral_areas.id", ondelete="SET NULL"), nullable=True),
            sa.Column("asignado_a", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("estado", sa.String(20), nullable=False, server_default="PENDIENTE"),
            sa.Column("prioridad", sa.String(10), nullable=False, server_default="MEDIA"),
            sa.Column("fecha_compromiso", sa.Date(), nullable=True),
            sa.Column("channel", sa.String(20), nullable=False, server_default="INTERNO"),
            sa.Column("moderacion", sa.String(20), nullable=False, server_default="VERIFICADO"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(36), nullable=True),
            sa.Column("updated_by", sa.String(36), nullable=True),
        )
    if not _index_exists("casos", "ix_casos_campaign_estado"):
        op.create_index("ix_casos_campaign_estado", "casos", ["campaign_id", "estado"])
    if not _index_exists("casos", "ix_casos_campaign_asignado"):
        op.create_index("ix_casos_campaign_asignado", "casos", ["campaign_id", "asignado_a"])
    if not _index_exists("casos", "ix_casos_campaign_seccion"):
        op.create_index("ix_casos_campaign_seccion", "casos", ["campaign_id", "seccion"])
    if not _index_exists("casos", "uq_casos_campaign_folio"):
        op.create_index("uq_casos_campaign_folio", "casos", ["campaign_id", "folio"], unique=True)

    if not _table_exists("caso_eventos"):
        op.create_table(
            "caso_eventos",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("caso_id", sa.String(36), sa.ForeignKey("casos.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("tipo", sa.String(20), nullable=False),
            sa.Column("texto", sa.String(2000), nullable=True),
            sa.Column("evidencia_key", sa.String(300), nullable=True),
            sa.Column("estado_nuevo", sa.String(20), nullable=True),
            sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(36), nullable=True),
            sa.Column("updated_by", sa.String(36), nullable=True),
        )
    if not _index_exists("caso_eventos", "ix_caso_eventos_caso"):
        op.create_index("ix_caso_eventos_caso", "caso_eventos", ["caso_id", "created_at"])


def downgrade() -> None:
    if _table_exists("caso_eventos"):
        op.drop_table("caso_eventos")
    if _table_exists("casos"):
        op.drop_table("casos")
    if _table_exists("form_responses"):
        op.drop_table("form_responses")
    if _table_exists("form_definitions"):
        op.drop_table("form_definitions")
