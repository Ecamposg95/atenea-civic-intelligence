"""Central tenant/campaign scoping chokepoint. All campaign-scoped reads/writes
go through scoped_query so isolation is enforced in exactly one place."""
from __future__ import annotations

from sqlalchemy import or_, select


def scoped_query(model, ctx):
    """Return a SELECT for `model` filtered by the request's tenant/campaign.

    - Soft-deleted rows excluded when the model has `deleted_at` (always applied,
      even for superadmin consolidated views).
    - Superadmin with no base selected (organization_id is None) → consolidated
      cross-tenant view: org/campaign filters are skipped entirely.
    - Superadmin with a base selected (organization_id adopted from campaign) →
      normal filtering applies exactly as for regular users.
    - Models with a NULLABLE organization_id (reference data, e.g. territory)
      match global rows (NULL) OR the tenant's own rows.
    - Models with a NOT-NULL organization_id filter strictly by tenant.
    - Models with `campaign_id` additionally filter by ctx.campaign_id.
    """
    stmt = select(model)
    cols = model.__table__.c

    if "deleted_at" in cols:
        stmt = stmt.where(cols.deleted_at.is_(None))

    # Superadmin with no base selected → consolidated view across all tenants.
    superadmin_all = getattr(ctx, "is_superadmin", False) and ctx.organization_id is None
    if superadmin_all:
        return stmt

    if "organization_id" in cols:
        if cols.organization_id.nullable:
            stmt = stmt.where(or_(cols.organization_id.is_(None), cols.organization_id == ctx.organization_id))
        else:
            stmt = stmt.where(cols.organization_id == ctx.organization_id)

    if "campaign_id" in cols:
        stmt = stmt.where(cols.campaign_id == ctx.campaign_id)

    return stmt
