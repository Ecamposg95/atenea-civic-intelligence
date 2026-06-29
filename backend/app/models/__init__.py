"""ORM models.

Importing the models here ensures they are registered on ``Base.metadata``
for Alembic autogeneration and ``create_all``.
"""

from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignMembership, Contest  # noqa: F401
from app.models.catalog import Cargo, Coalition, CoalitionParty, Party  # noqa: F401
from app.models.census import CensusMetric  # noqa: F401
from app.models.electoral_area import ElectoralArea
from app.models.ingestion import DataSource, IngestRun  # noqa: F401
from app.models.organization import Organization
from app.models.registro import Registro  # noqa: F401
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
    "ElectoralArea",
    "IngestRun",
    "Organization",
    "Party",
    "Registro",
    "User",
]
