"""Form definition service — builder CRUD for atención ciudadana forms.

Schema-validated (form_schema.validate_schema), campaign-scoped (scoped_query),
audited (record_audit). SchemaInvalid propagates to the router, which maps it
to HTTPException(422) — this service does not catch it.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.atencion import FormDefinition
from app.services.audit_service import record_audit
from app.services.form_schema import validate_schema


class SlugConflict(Exception):
    """Raised when a form's slug collides with another form in the campaign."""


def create_form(db: Session, ctx: CampaignContext, data) -> FormDefinition:
    validate_schema(data.schema)

    f = FormDefinition(
        organization_id=ctx.organization_id,
        campaign_id=ctx.campaign_id,
        nombre=data.nombre,
        descripcion=data.descripcion,
        tipo=data.tipo,
        slug=data.slug,
        canal=data.canal,
        is_active=data.is_active,
        version=1,
        schema=data.schema,
        created_by=ctx.user.id,
    )
    db.add(f)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if "slug" not in str(exc.orig).lower():
            raise
        raise SlugConflict() from exc

    record_audit(db, action="form.create", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="form_definition", entity_id=f.id)
    db.commit()
    db.refresh(f)
    return f


def list_forms(db: Session, ctx: CampaignContext, *, tipo: Optional[str] = None,
                canal: Optional[str] = None, is_active: Optional[bool] = None,
                q: Optional[str] = None, limit: int = 50, offset: int = 0
                ) -> tuple[list[FormDefinition], int]:
    stmt = scoped_query(FormDefinition, ctx)
    if tipo:
        stmt = stmt.where(FormDefinition.tipo == tipo)
    if canal:
        stmt = stmt.where(FormDefinition.canal == canal)
    if is_active is not None:
        stmt = stmt.where(FormDefinition.is_active == is_active)
    if q:
        stmt = stmt.where(FormDefinition.nombre.ilike(f"%{q}%"))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    ordered = stmt.order_by(FormDefinition.created_at.desc())
    rows = list(db.execute(ordered.limit(limit).offset(offset)).scalars().all())
    return rows, total


def get_form(db: Session, ctx: CampaignContext, form_id: str) -> Optional[FormDefinition]:
    return db.execute(
        scoped_query(FormDefinition, ctx).where(FormDefinition.id == form_id)
    ).scalar_one_or_none()


def get_by_slug(db: Session, ctx: CampaignContext, slug: str) -> Optional[FormDefinition]:
    """Return the active form for this campaign matching slug (capture-tier lookup)."""
    return db.execute(
        scoped_query(FormDefinition, ctx)
        .where(FormDefinition.slug == slug, FormDefinition.is_active.is_(True))
    ).scalar_one_or_none()


def update_form(db: Session, ctx: CampaignContext, form_id: str, data) -> Optional[FormDefinition]:
    f = get_form(db, ctx, form_id)
    if f is None:
        return None

    updates = data.model_dump(exclude_unset=True)
    if "schema" in updates:
        validate_schema(updates["schema"])

    for key, value in updates.items():
        setattr(f, key, value)
    if updates:
        f.version += 1
    f.updated_by = ctx.user.id

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if "slug" not in str(exc.orig).lower():
            raise
        raise SlugConflict() from exc

    record_audit(db, action="form.update", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="form_definition", entity_id=f.id)
    db.commit()
    db.refresh(f)
    return f
