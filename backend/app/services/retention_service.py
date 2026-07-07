"""Data retention / purge service (AC-7.4).

Election-date resolution
------------------------
A Registro is eligible for post-election purge when its campaign's **latest
non-NULL** ``Contest.election_date`` plus ``RETENTION_DAYS_AFTER_ELECTION``
days has passed.  Registros whose campaign has no Contest with a non-NULL
election_date are **never** eligible for Pass B — they are only subject to
Pass A (soft-delete age).

Two passes per run
------------------
Pass A — soft-delete purge
    Hard-delete rows where ``deleted_at`` < ``now - RETENTION_PURGE_SOFT_DELETED_DAYS``.

Pass B — post-election purge
    Hard-delete all remaining rows (active or soft-deleted) for campaigns
    whose max(election_date) <= today - RETENTION_DAYS_AFTER_ELECTION.

Safety guarantees
-----------------
* NO-OP when ``RETENTION_ENABLED=False`` (default).
* ``dry_run=True`` reports counts without touching the database.
* Idempotent: re-running on an already-purged dataset produces zero deletes.
* Audit records written per pass (Pass A and Pass B separately).
* No PII is written to audit logs.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.atencion import Caso, CasoEvento, FormResponse
from app.models.campaign import Contest
from app.models.militante import Militante
from app.models.registro import Registro
from app.services.audit_service import record_audit

logger = logging.getLogger(__name__)


@dataclass
class PurgeResult:
    """Counts and metadata from a single retention run."""

    soft_deleted_purged: int = 0
    post_election_purged: int = 0
    militantes_soft_deleted_purged: int = 0
    militantes_post_election_purged: int = 0
    casos_soft_deleted_purged: int = 0
    casos_post_election_purged: int = 0
    form_responses_soft_deleted_purged: int = 0
    form_responses_post_election_purged: int = 0
    campaigns_purged: List[str] = field(default_factory=list)
    dry_run: bool = False

    @property
    def total_purged(self) -> int:
        """Total rows hard-deleted (or that would be deleted in dry_run)."""
        return (
            self.soft_deleted_purged
            + self.post_election_purged
            + self.militantes_soft_deleted_purged
            + self.militantes_post_election_purged
            + self.casos_soft_deleted_purged
            + self.casos_post_election_purged
            + self.form_responses_soft_deleted_purged
            + self.form_responses_post_election_purged
        )


def _coerce_date(value) -> Optional[date_type]:
    """Normalize a DB-returned date value to a Python date.

    SQLite returns Date columns as Python date objects, but func.max() may
    return a string in ISO format on some backends.  Handle both.
    """
    if value is None:
        return None
    if isinstance(value, date_type):
        return value
    try:
        return date_type.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


def _purge_militante_docs(rows: list[Militante]) -> None:
    """Best-effort delete of bucket objects (INE photos + signature) for a batch
    of militantes about to be hard-deleted.

    Guards each object delete individually so a single failed/network-flaky
    delete does not abort the purge of the remaining rows.
    """
    from app.core import storage  # lazy: keeps the app importable without boto3

    if not storage.storage_enabled():
        return

    for row in rows:
        for key in (row.credencial_frente_key, row.credencial_reverso_key, row.firma_key):
            if not key:
                continue
            try:
                storage.delete_object(key)
            except Exception:  # noqa: BLE001 - never let a storage hiccup abort a purge
                logger.warning("retention.purge: failed to delete bucket object key=%s", key)


def _purge_caso_evidence(db: Session, rows: list[Caso]) -> None:
    """Best-effort delete of bucket evidencia objects attached to a batch of
    casos about to be hard-deleted. Casos don't carry evidence keys directly —
    they live on their CasoEvento (bitácora) rows — so this looks those up
    first. Guards each object delete individually, same discipline as
    ``_purge_militante_docs``.
    """
    from app.core import storage  # lazy: keeps the app importable without boto3

    if not storage.storage_enabled():
        return

    caso_ids = [row.id for row in rows]
    if not caso_ids:
        return

    keys = db.execute(
        select(CasoEvento.evidencia_key).where(
            CasoEvento.caso_id.in_(caso_ids), CasoEvento.evidencia_key.is_not(None)
        )
    ).scalars().all()

    for key in keys:
        if not key:
            continue
        try:
            storage.delete_object(key)
        except Exception:  # noqa: BLE001 - never let a storage hiccup abort a purge
            logger.warning("retention.purge: failed to delete bucket object key=%s", key)


def _purge_form_response_evidence(rows: list[FormResponse]) -> None:
    """Best-effort delete of bucket evidencia objects (``evidencia_keys``) for a
    batch of form responses about to be hard-deleted."""
    from app.core import storage  # lazy: keeps the app importable without boto3

    if not storage.storage_enabled():
        return

    for row in rows:
        for key in (row.evidencia_keys or []):
            if not key:
                continue
            try:
                storage.delete_object(key)
            except Exception:  # noqa: BLE001 - never let a storage hiccup abort a purge
                logger.warning("retention.purge: failed to delete bucket object key=%s", key)


def purge_expired(
    db: Session,
    *,
    now: Optional[datetime] = None,
    dry_run: bool = False,
) -> PurgeResult:
    """Purge expired registros according to the configured retention policy.

    Parameters
    ----------
    db:
        Active SQLAlchemy session.  The caller owns the session lifecycle.
    now:
        Reference timestamp for cutoff calculations (defaults to UTC now).
        Useful for testing with a fixed point in time.
    dry_run:
        When True, compute and return counts without modifying the database.

    Returns
    -------
    PurgeResult
        Counts per pass and list of purged campaign IDs.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    result = PurgeResult(dry_run=dry_run)

    # ── Safety gate ───────────────────────────────────────────────────────────
    if not settings.RETENTION_ENABLED:
        return result

    today: date_type = now.date() if isinstance(now, datetime) else now  # type: ignore[arg-type]

    # ── Pass A: hard-delete soft-deleted rows past their grace period ─────────
    soft_cutoff: datetime = now - timedelta(days=settings.RETENTION_PURGE_SOFT_DELETED_DAYS)

    soft_filter = (
        Registro.deleted_at.is_not(None),
        Registro.deleted_at < soft_cutoff,
    )

    soft_count: int = db.scalar(
        select(func.count(Registro.id)).where(*soft_filter)
    ) or 0

    if not dry_run and soft_count > 0:
        db.execute(delete(Registro).where(*soft_filter))
        record_audit(
            db,
            action="retention.purge",
            entity_type="registro",
            meta={
                "pass": "soft_deleted",
                "count": soft_count,
                "cutoff_days": settings.RETENTION_PURGE_SOFT_DELETED_DAYS,
            },
        )

    result.soft_deleted_purged = soft_count

    # ── Pass A (militantes): hard-delete soft-deleted rows past grace period ──
    militante_soft_filter = (
        Militante.deleted_at.is_not(None),
        Militante.deleted_at < soft_cutoff,
    )

    militante_soft_count: int = db.scalar(
        select(func.count(Militante.id)).where(*militante_soft_filter)
    ) or 0

    if not dry_run and militante_soft_count > 0:
        militante_rows = list(
            db.execute(select(Militante).where(*militante_soft_filter)).scalars().all()
        )
        _purge_militante_docs(militante_rows)
        db.execute(delete(Militante).where(*militante_soft_filter))
        record_audit(
            db,
            action="retention.purge",
            entity_type="militante",
            meta={
                "pass": "soft_deleted",
                "count": militante_soft_count,
                "cutoff_days": settings.RETENTION_PURGE_SOFT_DELETED_DAYS,
            },
        )

    result.militantes_soft_deleted_purged = militante_soft_count

    # ── Pass A (casos): hard-delete soft-deleted rows past grace period ───────
    caso_soft_filter = (
        Caso.deleted_at.is_not(None),
        Caso.deleted_at < soft_cutoff,
    )

    caso_soft_count: int = db.scalar(
        select(func.count(Caso.id)).where(*caso_soft_filter)
    ) or 0

    if not dry_run and caso_soft_count > 0:
        caso_rows = list(
            db.execute(select(Caso).where(*caso_soft_filter)).scalars().all()
        )
        _purge_caso_evidence(db, caso_rows)
        db.execute(delete(Caso).where(*caso_soft_filter))
        record_audit(
            db,
            action="retention.purge",
            entity_type="caso",
            meta={
                "pass": "soft_deleted",
                "count": caso_soft_count,
                "cutoff_days": settings.RETENTION_PURGE_SOFT_DELETED_DAYS,
            },
        )

    result.casos_soft_deleted_purged = caso_soft_count

    # ── Pass A (form_responses): hard-delete soft-deleted rows past grace ─────
    fr_soft_filter = (
        FormResponse.deleted_at.is_not(None),
        FormResponse.deleted_at < soft_cutoff,
    )

    fr_soft_count: int = db.scalar(
        select(func.count(FormResponse.id)).where(*fr_soft_filter)
    ) or 0

    if not dry_run and fr_soft_count > 0:
        fr_rows = list(
            db.execute(select(FormResponse).where(*fr_soft_filter)).scalars().all()
        )
        _purge_form_response_evidence(fr_rows)
        db.execute(delete(FormResponse).where(*fr_soft_filter))
        record_audit(
            db,
            action="retention.purge",
            entity_type="form_response",
            meta={
                "pass": "soft_deleted",
                "count": fr_soft_count,
                "cutoff_days": settings.RETENTION_PURGE_SOFT_DELETED_DAYS,
            },
        )

    result.form_responses_soft_deleted_purged = fr_soft_count

    # ── Pass B: post-election purge ───────────────────────────────────────────
    # Eligible: max(election_date) + RETENTION_DAYS_AFTER_ELECTION <= today
    #         ≡ max(election_date) <= today - RETENTION_DAYS_AFTER_ELECTION
    election_cutoff: date_type = today - timedelta(days=settings.RETENTION_DAYS_AFTER_ELECTION)

    campaign_max_rows = db.execute(
        select(Contest.campaign_id, func.max(Contest.election_date).label("max_date"))
        .where(Contest.election_date.is_not(None))
        .group_by(Contest.campaign_id)
    ).all()

    eligible_campaign_ids: list[str] = [
        row.campaign_id
        for row in campaign_max_rows
        if _coerce_date(row.max_date) is not None
        and _coerce_date(row.max_date) <= election_cutoff  # type: ignore[operator]
    ]

    post_count = 0
    if eligible_campaign_ids:
        post_filter = Registro.campaign_id.in_(eligible_campaign_ids)

        post_count = db.scalar(
            select(func.count(Registro.id)).where(post_filter)
        ) or 0

        if not dry_run and post_count > 0:
            db.execute(delete(Registro).where(post_filter))
            record_audit(
                db,
                action="retention.purge",
                entity_type="campaign",
                meta={
                    "pass": "post_election",
                    "count": post_count,
                    "campaign_ids": eligible_campaign_ids,
                    "cutoff_days": settings.RETENTION_DAYS_AFTER_ELECTION,
                },
            )

    result.post_election_purged = post_count
    result.campaigns_purged = list(eligible_campaign_ids)

    # ── Pass B (militantes): post-election purge, same eligible campaigns ─────
    militante_post_count = 0
    if eligible_campaign_ids:
        militante_post_filter = Militante.campaign_id.in_(eligible_campaign_ids)

        militante_post_count = db.scalar(
            select(func.count(Militante.id)).where(militante_post_filter)
        ) or 0

        if not dry_run and militante_post_count > 0:
            militante_rows = list(
                db.execute(select(Militante).where(militante_post_filter)).scalars().all()
            )
            _purge_militante_docs(militante_rows)
            db.execute(delete(Militante).where(militante_post_filter))
            record_audit(
                db,
                action="retention.purge",
                entity_type="militante",
                meta={
                    "pass": "post_election",
                    "count": militante_post_count,
                    "campaign_ids": eligible_campaign_ids,
                    "cutoff_days": settings.RETENTION_DAYS_AFTER_ELECTION,
                },
            )

    result.militantes_post_election_purged = militante_post_count

    # ── Pass B (casos): post-election purge, same eligible campaigns ──────────
    caso_post_count = 0
    if eligible_campaign_ids:
        caso_post_filter = Caso.campaign_id.in_(eligible_campaign_ids)

        caso_post_count = db.scalar(
            select(func.count(Caso.id)).where(caso_post_filter)
        ) or 0

        if not dry_run and caso_post_count > 0:
            caso_rows = list(
                db.execute(select(Caso).where(caso_post_filter)).scalars().all()
            )
            _purge_caso_evidence(db, caso_rows)
            db.execute(delete(Caso).where(caso_post_filter))
            record_audit(
                db,
                action="retention.purge",
                entity_type="caso",
                meta={
                    "pass": "post_election",
                    "count": caso_post_count,
                    "campaign_ids": eligible_campaign_ids,
                    "cutoff_days": settings.RETENTION_DAYS_AFTER_ELECTION,
                },
            )

    result.casos_post_election_purged = caso_post_count

    # ── Pass B (form_responses): post-election purge, same eligible campaigns ─
    fr_post_count = 0
    if eligible_campaign_ids:
        fr_post_filter = FormResponse.campaign_id.in_(eligible_campaign_ids)

        fr_post_count = db.scalar(
            select(func.count(FormResponse.id)).where(fr_post_filter)
        ) or 0

        if not dry_run and fr_post_count > 0:
            fr_rows = list(
                db.execute(select(FormResponse).where(fr_post_filter)).scalars().all()
            )
            _purge_form_response_evidence(fr_rows)
            db.execute(delete(FormResponse).where(fr_post_filter))
            record_audit(
                db,
                action="retention.purge",
                entity_type="form_response",
                meta={
                    "pass": "post_election",
                    "count": fr_post_count,
                    "campaign_ids": eligible_campaign_ids,
                    "cutoff_days": settings.RETENTION_DAYS_AFTER_ELECTION,
                },
            )

    result.form_responses_post_election_purged = fr_post_count

    # ── Commit (single transaction for both passes) ───────────────────────────
    if not dry_run and result.total_purged > 0:
        db.commit()

    return result
