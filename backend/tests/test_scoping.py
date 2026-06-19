"""Unit tests for the scoped_query chokepoint (app.core.scoping).

These tests are pure-Python: they only inspect the SQL *text* of the
generated SELECT statement — no database connection is needed.
"""

from app.core.scoping import scoped_query
from app.models.campaign import Contest
from app.models.electoral_area import ElectoralArea


class _Ctx:
    def __init__(self, tenant, campaign, is_super=False):
        self.organization_id = tenant
        self.campaign_id = campaign
        self.is_superadmin = is_super


def test_scoped_query_filters_tenant_and_campaign():
    sql = str(scoped_query(Contest, _Ctx("org1", "camp1")))
    assert "organization_id" in sql and "campaign_id" in sql


def test_scoped_query_reference_model_allows_global_or_tenant():
    sql = str(scoped_query(ElectoralArea, _Ctx("org1", "camp1")))
    # nullable-tenant reference model: filter present, no campaign_id (model has none)
    assert "organization_id" in sql
    assert "campaign_id" not in sql
