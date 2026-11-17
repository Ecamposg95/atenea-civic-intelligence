"""Mapa seccional (spec 2026-11-17 §7): sección polygons + metas 2027 +
resultados 2024 + campaign avance, as one GeoJSON FeatureCollection.

A feature may stand for several secciones (``properties.secciones``), e.g. the
INE 2021 polygon of 4127 → "6673/6674": metas, results and avance are summed,
and each sección's own región/prioridad is listed in ``secciones_detalle``.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.registro import Registro
from app.seeds import sma

_TIPOS = ("LIDER", "ACTIVISTA", "PROMOVIDO")
_META_KEYS = ("ln_may25", "proy_2027", "meta_lideres", "meta_activistas", "meta_promovidos")
_SUM_2024 = ("lista_nominal", "votos", "coalicion", "morena")


def _avance(db: Session, ctx: CampaignContext) -> tuple[dict, dict]:
    """({seccion: {LIDER, ACTIVISTA, PROMOVIDO}} for new captures, {seccion: n} legacy)."""
    nuevos: dict[str, dict[str, int]] = {}
    viejos: dict[str, int] = {}
    stmt = (
        scoped_query(Registro, ctx)
        .with_only_columns(Registro.seccion, Registro.tipo, Registro.legacy, func.count())
        .group_by(Registro.seccion, Registro.tipo, Registro.legacy)
    )
    for seccion, tipo, legacy, n in db.execute(stmt).all():
        if not seccion:
            continue
        if legacy:
            viejos[seccion] = viejos.get(seccion, 0) + n
        elif tipo in _TIPOS:
            d = nuevos.setdefault(seccion, {t: 0 for t in _TIPOS})
            d[tipo] += n
    return nuevos, viejos


def _pct(a: int, b: int) -> Optional[float]:
    return round(a / b * 100, 1) if b else None


def mapa(db: Session, ctx: CampaignContext, code: str) -> Optional[dict]:
    fc = sma.geojson(code)
    if fc is None:
        return None
    metas = sma.metas(code)
    res24 = sma.resultados_2024(code)
    nuevos, viejos = _avance(db, ctx)

    totales = {k: 0 for k in ("meta_lideres", "meta_activistas", "meta_promovidos",
                              "lideres", "activistas", "promovidos", "viejos")}
    for feat in fc.get("features", []):
        props = feat.setdefault("properties", {})
        secs = props.get("secciones") or [str(props.get("seccion"))]
        detalle = [{"seccion": s, "barrio": metas.get(s, {}).get("barrio"),
                    "region": metas.get(s, {}).get("region"),
                    "prioridad": metas.get(s, {}).get("prioridad")} for s in secs]
        # región/barrio/prioridad: from the last sección that has metas
        # (for "6673/6674" → 6674; both are R-4 San Pedro).
        primary = next((metas[s] for s in reversed(secs) if s in metas), {})
        p: dict = {
            "seccion": props.get("seccion"),
            "secciones": secs,
            "secciones_detalle": detalle,
            "barrio": primary.get("barrio"),
            "region": primary.get("region"),
            "prioridad": primary.get("prioridad"),
        }
        for k in _META_KEYS:
            p[k] = sum(metas.get(s, {}).get(k, 0) for s in secs)

        r = [res24[s] for s in secs if s in res24]
        if r:
            sums = {k: sum(x[k] for x in r) for k in _SUM_2024}
            p["resultado_2024"] = {
                **sums,
                "participacion": _pct(sums["votos"], sums["lista_nominal"]) if len(r) > 1
                else r[0]["participacion"],
                "margen": sums["coalicion"] - sums["morena"],
                "etiqueta": r[-1]["etiqueta"] if len({x["etiqueta"] for x in r}) == 1
                else " / ".join(x["etiqueta"] for x in r),
            }
        else:
            p["resultado_2024"] = None

        lid = sum(nuevos.get(s, {}).get("LIDER", 0) for s in secs)
        act = sum(nuevos.get(s, {}).get("ACTIVISTA", 0) for s in secs)
        pro = sum(nuevos.get(s, {}).get("PROMOVIDO", 0) for s in secs)
        vie = sum(viejos.get(s, 0) for s in secs)
        p["avance"] = {
            "lideres": lid, "activistas": act, "promovidos": pro, "viejos": vie,
            "pct_lideres": _pct(lid, p["meta_lideres"]),
            "pct_activistas": _pct(act, p["meta_activistas"]),
            "pct_promovidos": _pct(pro, p["meta_promovidos"]),
        }
        if "nota" in props:
            p["nota"] = props["nota"]
        feat["properties"] = p

        totales["meta_lideres"] += p["meta_lideres"]
        totales["meta_activistas"] += p["meta_activistas"]
        totales["meta_promovidos"] += p["meta_promovidos"]
        totales["lideres"] += lid
        totales["activistas"] += act
        totales["promovidos"] += pro
        totales["viejos"] += vie

    totales["secciones"] = len(metas)
    totales["pct_promovidos"] = _pct(totales["promovidos"], totales["meta_promovidos"])
    return {
        "type": "FeatureCollection",
        "municipio_code": code,
        "fuente": fc.get("source"),
        "features": fc.get("features", []),
        "totales": totales,
    }
