"""INE México data-source integrations.

Modules:
  - ``cartografia``  SIGE / Marco Geográfico Electoral (WMS + GeoJSON)
  - ``config``       base URLs, level mapping, source registry
"""

from app.integrations.ine import (  # noqa: F401
    cartografia,
    config,
)
