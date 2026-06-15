"""World Bank indicators for Mexico (national time series). No token; reliable."""

from __future__ import annotations

from typing import Any, Callable

from app.integrations.ine.base import get_json

BASE = "https://api.worldbank.org/v2/country/MX/indicator"
SOURCE = "World Bank Open Data"

INDICATORS: dict[str, str] = {
    "NY.GDP.MKTP.CD": "PIB (USD corrientes)",
    "SP.POP.TOTL": "Población total",
    "SL.UEM.TOTL.ZS": "Desempleo (% fuerza laboral)",
    "FP.CPI.TOTL.ZG": "Inflación (% anual)",
    "SI.POV.NAHC": "Pobreza (% nacional)",
}


def list_indicators() -> list[dict[str, str]]:
    return [{"code": c, "label": label} for c, label in INDICATORS.items()]


def fetch_indicator(
    code: str, *, fetch: Callable[[str, dict[str, Any]], Any] | None = None
) -> dict[str, Any]:
    url = f"{BASE}/{code}"
    params = {"format": "json", "per_page": 20000}
    fetcher = fetch or (lambda u, p: get_json(u, params=p))
    payload = fetcher(url, params)
    series = payload[1] if isinstance(payload, list) and len(payload) > 1 and payload[1] else []
    points = [
        {"year": int(row["date"]), "value": float(row["value"])}
        for row in series
        if row.get("value") is not None and str(row.get("date", "")).isdigit()
    ]
    points.sort(key=lambda p: p["year"])
    return {
        "indicator": code,
        "label": INDICATORS.get(code, code),
        "points": points,
        "latest": points[-1] if points else None,
        "source": SOURCE,
    }
