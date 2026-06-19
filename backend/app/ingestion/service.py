"""Ingestion service: tenant-scoped IngestRun queries."""
from sqlalchemy import select

from app.models.ingestion import IngestRun


def _org_scoped(ctx):
    """Return a SELECT on IngestRun scoped to the caller's organization only.

    Intentionally does NOT filter by campaign_id so that /runs can be called
    without X-Campaign-Id (Tenant ctx) and still return all org-level runs.
    """
    stmt = select(IngestRun).where(IngestRun.organization_id == ctx.organization_id)
    return stmt


def list_runs(db, ctx, limit=100):
    stmt = _org_scoped(ctx).order_by(IngestRun.started_at.desc()).limit(limit)
    return list(db.execute(stmt).scalars())


def get_run(db, ctx, run_id):
    stmt = _org_scoped(ctx).where(IngestRun.id == run_id)
    return db.execute(stmt).scalar_one_or_none()
