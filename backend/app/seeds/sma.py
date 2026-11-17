"""San Mateo Atenco (15076) reference data loaders — read-only, cached.

- ``metas_2027.csv``: per-sección barrio, región, prioridad, LN, proyección and
  2027 goals (líderes / activistas / promovidos). Source: Carpeta de Activismo
  VG 2027, p. 6 (totals 400 / 4,000 / 28,000).
- ``secciones_2024.csv``: 2024 results per sección.
- ``secciones.geojson``: INE 2021 polygons (4127 → feature "6673/6674").
"""
from __future__ import annotations

import csv
import json
import os
from functools import lru_cache
from typing import Optional

SMA_CODE = "15076"

_BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "municipios")

_INT_METAS = ("ln_may25", "proy_2027", "meta_lideres", "meta_activistas", "meta_promovidos")
_INT_2024 = ("lista_nominal", "votos", "coalicion", "morena", "margen")


def _path(code: str, name: str) -> str:
    return os.path.join(_BASE, code, name)


@lru_cache(maxsize=8)
def metas(code: str = SMA_CODE) -> dict[str, dict]:
    """{seccion: {seccion, barrio, region, prioridad, ln_may25, ...}} or {}."""
    p = _path(code, "metas_2027.csv")
    if not os.path.exists(p):
        return {}
    out: dict[str, dict] = {}
    with open(p, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            sec = row["seccion"].strip()
            rec: dict = {"seccion": sec, "barrio": row["barrio"].strip(),
                         "region": row["region"].strip(), "prioridad": row["prioridad"].strip()}
            for k in _INT_METAS:
                rec[k] = int(row[k])
            out[sec] = rec
    return out


@lru_cache(maxsize=8)
def resultados_2024(code: str = SMA_CODE) -> dict[str, dict]:
    p = _path(code, "secciones_2024.csv")
    if not os.path.exists(p):
        return {}
    out: dict[str, dict] = {}
    with open(p, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            sec = row["seccion"].strip()
            rec: dict = {k: int(row[k]) for k in _INT_2024}
            rec["participacion"] = float(row["participacion"])
            rec["etiqueta"] = row["prioridad"].strip()
            out[sec] = rec
    return out


@lru_cache(maxsize=8)
def _geojson_text(code: str) -> Optional[str]:
    p = _path(code, "secciones.geojson")
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as fh:
        return fh.read()


def geojson(code: str) -> Optional[dict]:
    """A fresh (mutable) copy of the municipio's sección polygons, or None."""
    txt = _geojson_text(code)
    return json.loads(txt) if txt is not None else None


def secciones_validas(code: str = SMA_CODE) -> frozenset[str]:
    return frozenset(metas(code))


def barrios(code: str = SMA_CODE) -> list[str]:
    return sorted({m["barrio"] for m in metas(code).values()})
