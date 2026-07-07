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

ANTI-ABUSE (implemented): the anonymous submit endpoint is protected by four
layers, all still behind the ``PUBLIC_FORMS_ENABLED`` gate:

  1. Per-IP rate limiting via the shared ``app.core.rate_limiting.limiter``
     (slowapi) — a short burst window (``PUBLIC_FORM_RATE_LIMIT``) AND a daily
     cap (``PUBLIC_FORM_DAILY_LIMIT``), both keyed on client IP.
  2. Honeypot fields (``website`` / ``_hp``) — filled by bots, invisible to
     humans; a non-empty value is rejected (generic 400) BEFORE any response or
     caso is created, and audited.
  3. Payload guards — total serialized answers size and per-answer length are
     bounded (``PUBLIC_FORM_MAX_PAYLOAD_BYTES`` / ``PUBLIC_FORM_MAX_ANSWER_LEN``)
     so the endpoint can't be used to dump huge blobs.
  4. No file uploads — ``foto``-type answers and any ``evidencia_keys`` are
     stripped on the public path (the internal authenticated channel keeps
     evidence support).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import crypto
from app.core.config import settings
from app.core.rate_limiting import limiter
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
    arbitrary bucket keys).

    ``website`` / ``_hp`` are HONEYPOT fields: a real UI keeps them hidden and
    empty, so any non-empty value flags an automated submission (see
    ``_is_honeypot``). They are accepted (not rejected by validation) so the
    rejection can happen silently server-side rather than leaking their purpose
    via a 422.
    """

    model_config = ConfigDict(populate_by_name=True)

    answers: dict
    nombre_emisor: Optional[str] = Field(default=None, max_length=255)
    contacto: Optional[str] = Field(default=None, max_length=160)
    seccion: Optional[str] = Field(default=None, max_length=20)
    client_uuid: Optional[str] = Field(default=None, max_length=64)
    # Honeypots (must stay empty for legitimate submissions).
    website: Optional[str] = Field(default=None, max_length=255)
    hp: Optional[str] = Field(default=None, alias="_hp", max_length=255)


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


def _is_honeypot(payload: PublicFormResponseCreate) -> bool:
    """True if any honeypot field carries a value (bots fill these; humans don't)."""
    return bool((payload.website or "").strip()) or bool((payload.hp or "").strip())


def _guard_payload_size(payload: PublicFormResponseCreate) -> None:
    """Reject oversized submissions so the public endpoint can't be used to
    dump huge blobs. Enforces a total serialized-answers byte cap and a
    per-answer-value length cap. Raises HTTPException(413) on violation.

    The error message is intentionally generic and never echoes the offending
    value (Golden Rule #9 — no PII in error responses)."""
    if not isinstance(payload.answers, dict):
        # Defensive: pydantic types this as dict, but guard anyway.
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="answers debe ser un objeto")
    blob = json.dumps(payload.answers, ensure_ascii=False)
    if len(blob.encode("utf-8")) > settings.PUBLIC_FORM_MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Payload demasiado grande",
        )
    max_len = settings.PUBLIC_FORM_MAX_ANSWER_LEN
    for value in payload.answers.values():
        if isinstance(value, str) and len(value) > max_len:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Respuesta demasiado larga",
            )


def _strip_file_answers(schema: dict, answers: dict) -> dict:
    """Drop any ``foto``-type answers: the public channel v1 accepts no file /
    evidence uploads. Returns a new dict without those keys (silently ignored,
    not an error), so an anonymous caller can never reference bucket objects."""
    foto_keys = {
        f.get("key")
        for sec in schema.get("secciones", [])
        for f in sec.get("campos", [])
        if f.get("tipo") == "foto"
    }
    if not foto_keys:
        return answers
    return {k: v for k, v in answers.items() if k not in foto_keys}


def _crear_public_response(db: Session, form: FormDefinition,
                            payload: PublicFormResponseCreate) -> FormResponse:
    """Mirrors response_service.crear_response, fixing moderacion to
    SIN_VERIFICAR (public/unauthenticated intake is never auto-verified)."""
    safe_answers = _strip_file_answers(form.schema, payload.answers)
    validated = validate_answers(form.schema, safe_answers)
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
@limiter.limit(settings.PUBLIC_FORM_RATE_LIMIT)
@limiter.limit(settings.PUBLIC_FORM_DAILY_LIMIT)
def create_public_response(request: Request, db: DbSession, slug: str,
                            data: PublicFormResponseCreate):
    # Anti-abuse ordering: the enabled gate + form resolution first (so a
    # disabled/unknown channel is indistinguishable from any other), then the
    # cheap in-memory guards (honeypot, size) BEFORE any DB writes. Per-IP rate
    # limiting is applied by the decorators above (429 via the global handler).
    _guard_enabled()
    form = _resolve_public_form(db, slug)
    if form is None:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")

    if _is_honeypot(data):
        # Silently reject: no response, no caso. Audit it (org derived from the
        # resolved form, never from input) without logging any PII.
        record_audit(db, action="response.reject.honeypot",
                     entity_type="form_response", entity_id=None,
                     organization_id=form.organization_id)
        db.commit()
        # Generic 400 that does not reveal the honeypot mechanism.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Solicitud inválida")

    _guard_payload_size(data)

    try:
        resp = _crear_public_response(db, form, data)
    except AnswersInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    caso_service.crear_desde_respuesta(db, _public_ctx(form), resp, form)
    db.refresh(resp)
    return FormResponseRead.model_validate(resp, from_attributes=True)
