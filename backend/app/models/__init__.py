"""ORM models.

Importing the models here ensures they are registered on ``Base.metadata``
for Alembic autogeneration and ``create_all``.
"""

from app.models.arco import ArcoRequest  # noqa: F401
from app.models.atencion import Caso, CasoEvento, FormDefinition, FormResponse  # noqa: F401
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignMembership, Contest  # noqa: F401
from app.models.catalog import Cargo, Coalition, CoalitionParty, Party  # noqa: F401
from app.models.census import CensusMetric  # noqa: F401
from app.models.electoral_area import ElectoralArea
from app.models.ingestion import DataSource, IngestRun  # noqa: F401
from app.models.militante import Militante  # noqa: F401
from app.models.organization import Organization
from app.models.privacy import PrivacyAcceptance, PrivacyNotice  # noqa: F401
from app.models.registro import Registro  # noqa: F401
from app.models.seccion_electoral import SeccionElectoral  # noqa: F401
from app.models.user import User

__all__ = [
    "ArcoRequest",
    "AuditLog",
    "Campaign",
    "CampaignMembership",
    "Cargo",
    "Caso",
    "CasoEvento",
    "CensusMetric",
    "Coalition",
    "CoalitionParty",
    "Contest",
    "DataSource",
    "ElectoralArea",
    "FormDefinition",
    "FormResponse",
    "IngestRun",
    "Militante",
    "Organization",
    "Party",
    "PrivacyAcceptance",
    "PrivacyNotice",
    "Registro",
    "SeccionElectoral",
    "User",
]
