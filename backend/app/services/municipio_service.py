"""Municipal intelligence panorama — stitches the VG study data (CensusMetric
socio/mobility/electoral-history + SeccionElectoral 2024 matrix) into one
read-only executive payload. Territory data is org-global (organization_id NULL),
so this is an intelligence read, not a tenant-scoped write."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.census import CensusMetric
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.seccion_electoral import SeccionElectoral

_ANIO_ACTUAL = 2024

# Fixed display order for the 2024 party breakdown (study "anatomía del voto").
_PARTIDOS = ["MORENA", "PRI", "PVEM", "MC", "PAN", "PT", "PRD", "NAEM"]


def _metrics(db: Session, code: str) -> dict[tuple[int, str], float]:
    rows = db.execute(
        select(CensusMetric).where(
            CensusMetric.nivel == "MUNICIPIO",
            CensusMetric.territory_code == code,
        )
    ).scalars()
    return {(m.anio, m.indicador): float(m.valor) for m in rows}


def panorama(db: Session, code: str) -> Optional[dict]:
    muni = db.execute(
        select(ElectoralArea).where(
            ElectoralArea.code == code, ElectoralArea.level == AreaLevel.MUNICIPIO
        )
    ).scalar_one_or_none()
    m = _metrics(db, code)
    if muni is None and not m:
        return None

    # Socio + mobility snapshot (latest census year present, 2020 in the study).
    socio = {ind: val for (anio, ind), val in m.items()
             if ind not in _ELECTORAL_INDS and not ind.startswith("voto_")
             and not ind.startswith("secciones_") and ind != "coalicion_ganadora_votos"
             and ind != "participacion_prom_seccional"}

    # Electoral history (one row per year that has electoral metrics).
    hist_years = sorted({anio for (anio, ind) in m if ind.startswith("elec_")})
    historico = [{
        "anio": y,
        "lista_nominal": m.get((y, "elec_lista_nominal")),
        "votos_totales": m.get((y, "elec_votos_totales")),
        "participacion": m.get((y, "elec_participacion")),
        "margen_votos": m.get((y, "elec_margen_votos")),
        "margen_pp": m.get((y, "elec_margen_pp")),
    } for y in hist_years]

    # 2024 party breakdown (only parties with a value), descending by votes.
    voto2024 = [{"partido": p, "votos": int(m[(_ANIO_ACTUAL, f"voto_{p}")])}
                for p in _PARTIDOS if (_ANIO_ACTUAL, f"voto_{p}") in m]
    voto2024.sort(key=lambda x: x["votos"], reverse=True)

    # Section matrix (SeccionElectoral 2024).
    secciones = [{
        "seccion": s.seccion,
        "lista_nominal": s.lista_nominal,
        "votos": s.votos,
        "participacion": float(s.participacion),
        "coalicion": s.coalicion,
        "morena": s.morena,
        "margen": s.margen,
        "prioridad": s.prioridad,
    } for s in db.execute(
        select(SeccionElectoral)
        .where(SeccionElectoral.municipio == (muni.name if muni else ""),
               SeccionElectoral.anio == _ANIO_ACTUAL)
        .order_by(SeccionElectoral.margen)
    ).scalars()]

    resumen = {
        "total": int(m.get((_ANIO_ACTUAL, "secciones_total"), len(secciones))),
        "morena": _opt_int(m.get((_ANIO_ACTUAL, "secciones_morena"))),
        "coalicion": _opt_int(m.get((_ANIO_ACTUAL, "secciones_coalicion"))),
        "persuadibles": _opt_int(m.get((_ANIO_ACTUAL, "secciones_persuadibles"))),
        "participacion_prom": m.get((_ANIO_ACTUAL, "participacion_prom_seccional")),
        "casillas": _opt_int(m.get((_ANIO_ACTUAL, "elec_casillas"))),
        "votos_2024": _opt_int(m.get((_ANIO_ACTUAL, "elec_votos_totales"))),
        "margen_2024": _opt_int(m.get((_ANIO_ACTUAL, "elec_margen_votos"))),
        "margen_pp_2024": m.get((_ANIO_ACTUAL, "elec_margen_pp")),
        "participacion_2024": m.get((_ANIO_ACTUAL, "elec_participacion")),
    }

    return {
        "municipio": {"code": code, "name": muni.name if muni else "San Mateo Atenco"},
        "socio": socio,
        "historico": historico,
        "voto2024": voto2024,
        "coalicion_ganadora_votos": _opt_int(m.get((_ANIO_ACTUAL, "coalicion_ganadora_votos"))),
        "secciones_resumen": resumen,
        "secciones": secciones,
    }


def _opt_int(v):
    return int(v) if v is not None else None


# Electoral-history indicator names (excluded from the socio snapshot).
_ELECTORAL_INDS = {
    "elec_lista_nominal", "elec_votos_totales", "elec_participacion",
    "elec_margen_votos", "elec_margen_pp", "elec_casillas",
}
