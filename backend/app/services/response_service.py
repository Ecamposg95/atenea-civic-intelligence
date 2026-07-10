"""Form response service — a citizen/activist submission against a
``FormDefinition``. Validates answers against the form's schema, splits and
Fernet-encrypts the sensitive subset, masks the response envelope's contacto,
and opens a ``Caso`` from the response (delegated to ``caso_service``).

Mirrors ``form_service`` / ``caso_service`` for scoping, crypto, and audit.
"""
from __future__ import annotations

import json
from typing import Optional

from sqlalchemy.orm import Session

from app.core import crypto
from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.atencion import FormResponse
from app.services import caso_service, form_service
from app.services.audit_service import record_audit
from app.services.form_schema import split_sensitive, validate_answers


class FormNotFound(Exception):
    """Raised when ``form_definition_id`` doesn't resolve within scope."""


def _mask(value: str) -> str:
    """Masked display value for a contacto (phone/email): ``****-1234``."""
    return f"****-{value[-4:]}" if value else ""


def crear_response(db: Session, ctx: CampaignContext, data, *,
                    channel: str, captured_by: Optional[str]) -> FormResponse:
    """Create a FormResponse from ``data`` (FormResponseCreate) and open its Caso.

    - Loads the form (scoped) — raises FormNotFound if missing/out of scope.
    - Validates answers against the form's schema (raises AnswersInvalid).
    - Splits sensitive fields out; encrypts them as JSON into answers_enc.
      Public answers are stored in cleartext in ``answers`` (schema-validated,
      not raw PII per se — sensibility is a per-field author decision).
    - Masks the envelope contacto (if provided) into contacto_masked.
    - Delegates Caso creation to caso_service.crear_desde_respuesta, which
      links both directions (Caso.origin_response_id / response.caso_id).
    """
    if data.client_uuid:
        existing = db.execute(
            scoped_query(FormResponse, ctx)
            .where(FormResponse.client_uuid == data.client_uuid)
        ).scalar_one_or_none()
        if existing is not None:
            return existing  # idempotente: no re-crea (ni abre otro caso)

    form = form_service.get_form(db, ctx, data.form_definition_id)
    if form is None:
        raise FormNotFound()

    validated = validate_answers(form.schema, data.answers)
    pub, sens = split_sensitive(form.schema, validated)
    answers_enc = crypto.encrypt_clave(json.dumps(sens)) if sens else None
    contacto_masked = _mask(data.contacto) if data.contacto else None

    resp = FormResponse(
        organization_id=ctx.organization_id,
        campaign_id=ctx.campaign_id,
        form_definition_id=form.id,
        answers=pub,
        answers_enc=answers_enc,
        channel=channel.upper(),
        captured_by=captured_by,
        nombre_emisor=data.nombre_emisor,
        contacto_masked=contacto_masked,
        seccion=data.seccion,
        evidencia_keys=data.evidencia_keys,
        moderacion="VERIFICADO",
        client_uuid=data.client_uuid,
        created_by=ctx.user.id,
    )
    db.add(resp)
    db.flush()

    record_audit(db, action="response.create", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="form_response",
                 entity_id=resp.id)
    db.commit()
    db.refresh(resp)

    caso_service.crear_desde_respuesta(db, ctx, resp, form)
    db.refresh(resp)
    return resp
