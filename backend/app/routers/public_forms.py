"""/api/public/forms — anonymous public intake channel (behind
``settings.PUBLIC_FORMS_ENABLED``, default False).

No auth / ``CampaignCtx`` dependency: the caller is an unauthenticated citizen,
so there is no JWT to derive a tenant from. Instead the ``FormDefinition`` is
resolved by ``slug`` *across all tenants* (public forms are expected to use
globally-distinctive slugs) and the org/campaign for the resulting
``FormResponse``/``Caso`` are derived FROM that form — never from request
input, preserving Golden Rule #2. Every route is guarded by
``if not settings.PUBLIC_FORMS_ENABLED: raise HTTPException(404)`` so the
channel is invisible (not just rejected) while the flag is off.

Response creation deliberately does NOT go through ``response_service.crear_response``:
that helper hardcodes ``moderacion="VERIFICADO"`` for the authenticated capture
tier, whereas every public submission must land as ``moderacion="SIN_VERIFICAR"``
(unmoderated intake, reviewed before it's trusted). The logic below mirrors
``response_service.crear_response`` (validate → split sensitive → Fernet-encrypt
→ mask contacto) with that one deliberate difference, then delegates Caso
creation to the same ``caso_service.crear_desde_respuesta`` used by the
authenticated flow.

ANTI-ABUSE IS NOT IMPLEMENTED (documented deferral): this endpoint has no
honeypot field and no rate limiting. Before setting ``PUBLIC_FORMS_ENABLED=True``
in production, add a honeypot field (reject submissions that fill it) and a
slowapi rate limit (mirroring ``LOGIN_RATE_LIMIT`` / ``app.core.rate_limiting``)
to both routes below — otherwise this channel is an open spam/DoS vector.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import crypto
from app.core.config import settings
from app.dependencies import CampaignContext, DbSession
from app.models.atencion import FormDefinition, FormResponse
from app.models.user import UserRole
from app.schemas.atencion import FormDefinitionRead, FormResponseRead
from app.services import caso_service
from app.services.audit_service import record_audit
from app.services.form_schema import AnswersInvalid, split_sensitive, validate_answers

router = APIRouter(tags=["public-forms"])

_PUBLIC_CANALES = ("PUBLICO", "AMBOS")


class PublicFormResponseCreate(BaseModel):
    """Public-facing submission payload. No ``form_definition_id`` (comes from
    the URL slug) and no ``evidencia_keys`` (anonymous callers cannot reference
    arbitrary bucket keys)."""

    answers: dict
    nombre_emisor: Optional[str] = Field(default=None, max_length=255)
    contacto: Optional[str] = Field(default=None, max_length=160)
    seccion: Optional[str] = Field(default=None, max_length=20)
    client_uuid: Optional[str] = Field(default=None, max_length=64)


@dataclass(frozen=True)
class _AnonUser:
    """Duck-typed stand-in for ``User`` — only ``.id`` is read downstream
    (created_by / actor_id columns, all nullable)."""

    id: Optional[str] = None


def _guard_enabled() -> None:
    if not settings.PUBLIC_FORMS_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _resolve_public_form(db: Session, slug: str) -> Optional[FormDefinition]:
    """Resolve a live, active, public-channel form by slug, across all tenants.

    ``slug`` is only unique per-campaign (uq_form_definitions_campaign_slug), so a
    global public lookup can match forms from more than one org. Until public-slug
    GLOBAL uniqueness is introduced, cross-org slug collisions are resolved
    DETERMINISTICALLY to the OLDEST active public form (order_by created_at) — an
    acceptable, stable tie-break. Soft-deleted, inactive, and non-public
    (INTERNO-only) forms are excluded so they are invisible on the public channel.
    """
    return db.execute(
        select(FormDefinition).where(
            FormDefinition.slug == slug,
            FormDefinition.deleted_at.is_(None),
            FormDefinition.is_active.is_(True),
            FormDefinition.canal.in_(_PUBLIC_CANALES),
        ).order_by(FormDefinition.created_at)
    ).scalars().first()


def _public_ctx(form: FormDefinition) -> CampaignContext:
    """Minimal context for caso_service, derived entirely from the resolved
    form (never from request input)."""
    return CampaignContext(
        user=_AnonUser(),
        organization_id=form.organization_id,
        role=UserRole.ACTIVISTA,
        campaign_id=form.campaign_id,
    )


def _mask(value: str) -> str:
    return f"****-{value[-4:]}" if value else ""


def _crear_public_response(db: Session, form: FormDefinition,
                            payload: PublicFormResponseCreate) -> FormResponse:
    """Mirrors response_service.crear_response, fixing moderacion to
    SIN_VERIFICAR (public/unauthenticated intake is never auto-verified)."""
    validated = validate_answers(form.schema, payload.answers)
    pub, sens = split_sensitive(form.schema, validated)
    answers_enc = crypto.encrypt_clave(json.dumps(sens)) if sens else None
    contacto_masked = _mask(payload.contacto) if payload.contacto else None

    resp = FormResponse(
        organization_id=form.organization_id,
        campaign_id=form.campaign_id,
        form_definition_id=form.id,
        answers=pub,
        answers_enc=answers_enc,
        channel="PUBLICO",
        captured_by=None,
        nombre_emisor=payload.nombre_emisor,
        contacto_masked=contacto_masked,
        seccion=payload.seccion,
        evidencia_keys=None,
        moderacion="SIN_VERIFICAR",
        client_uuid=payload.client_uuid,
        created_by=None,
    )
    db.add(resp)
    db.flush()

    record_audit(db, action="response.create.public", entity_type="form_response",
                 entity_id=resp.id, organization_id=form.organization_id)
    db.commit()
    db.refresh(resp)
    return resp


@router.get("/public/forms/{slug}", response_model=FormDefinitionRead)
def get_public_form(db: DbSession, slug: str):
    _guard_enabled()
    form = _resolve_public_form(db, slug)
    if form is None:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    return FormDefinitionRead.model_validate(form, from_attributes=True)


@router.post("/public/forms/{slug}/responses", response_model=FormResponseRead,
             status_code=status.HTTP_201_CREATED)
def create_public_response(db: DbSession, slug: str, data: PublicFormResponseCreate):
    _guard_enabled()
    form = _resolve_public_form(db, slug)
    if form is None:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")

    try:
        resp = _crear_public_response(db, form, data)
    except AnswersInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    caso_service.crear_desde_respuesta(db, _public_ctx(form), resp, form)
    db.refresh(resp)
    return FormResponseRead.model_validate(resp, from_attributes=True)
