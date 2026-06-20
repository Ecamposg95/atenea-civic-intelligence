"""ORM models.

Importing the models here ensures they are registered on ``Base.metadata``
for Alembic autogeneration and ``create_all``.
"""

from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignMembership, Contest  # noqa: F401
from app.models.catalog import Cargo, Coalition, CoalitionParty, Party  # noqa: F401
from app.models.census import CensusMetric  # noqa: F401
from app.models.economic_unit import EconomicUnit  # noqa: F401
from app.models.election_result import ElectionResult  # noqa: F401
from app.models.electoral_area import ElectoralArea
from app.models.ingestion import DataSource, IngestRun  # noqa: F401
from app.models.organization import Organization
from app.models.socio import SocioMetric  # noqa: F401
from app.models.user import User

__all__ = [
    "AuditLog",
    "Campaign",
    "CampaignMembership",
    "Cargo",
    "CensusMetric",
    "Coalition",
    "CoalitionParty",
    "Contest",
    "DataSource",
    "EconomicUnit",
    "ElectionResult",
    "ElectoralArea",
    "IngestRun",
    "Organization",
    "Party",
    "SocioMetric",
    "User",
]
