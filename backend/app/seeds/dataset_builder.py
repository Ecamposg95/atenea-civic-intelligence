"""Transformaciones puras IEEM (XLSX por sección) + INEGI ITER → filas de los CSV que
consume la plataforma (``secciones_2024.csv`` e ``intel.csv``). Sin red, sin BD.

Semántica (spec §3.1): la columna ``coalicion`` es el bloque PROPIO de la campaña y
``morena`` el bloque RIVAL; ``margen = coalicion - morena``.
"""
from __future__ import annotations

from typing import Iterable

# Bloques por año (partidos que forman cada bloque). Una columna del XLSX cuenta para
# un bloque cuando TODOS sus tokens (separados por "_", ignorando "CC") pertenecen al bloque.
BLOQUES: dict[int, dict] = {
    2024: {"propio": {"MORENA", "PVEM", "PT"}, "rivales": [{"PAN", "PRI", "PRD", "NAEM"}]},
    2021: {"propio": {"MORENA", "PT", "NAEM"}, "rivales": [{"PAN", "PRI", "PRD"}]},
    2018: {"propio": {"MORENA", "PT", "ES"}, "rivales": [{"PAN", "PRD", "MC"}, {"PRI"}, {"PVEM"}]},
}
PARTIDOS_2024 = ["MORENA", "PRI", "PVEM", "MC", "PAN", "PT", "PRD", "NAEM"]
_PARTIDOS_CONOCIDOS = {"PAN", "PRI", "PRD", "PVEM", "PT", "MC", "MORENA", "NAEM", "NA",
                       "PES", "RSP", "FXM", "ES", "VR"}
UMBRAL_ALTA = 30
UMBRAL_COMPETITIVA = 150


def clasificar_prioridad(margen: int) -> str:
    if abs(margen) < UMBRAL_ALTA:
        return "ALTA_PERSUADIBLE"
    if abs(margen) <= UMBRAL_COMPETITIVA:
        return "COMPETITIVA"
    return "DEFENDER_EXPANDIR" if margen > 0 else "RECUPERAR_OPOSICION"


def leer_hoja(ws) -> tuple[list[str], list[dict]]:
    """Devuelve (encabezado, filas dict). El encabezado es la primera fila que contiene
    la celda 'SECCION' (los XLSX del IEEM traen filas de título antes)."""
    header: list[str] | None = None
    rows: list[dict] = []
    for r in ws.iter_rows(values_only=True):
        if header is None:
            if r and "SECCION" in [str(x) for x in r]:
                header = [str(x) if x is not None else "" for x in r]
            continue
        if not r or all(x is None for x in r):
            continue
        rows.append(dict(zip(header, r)))
    if header is None:
        raise ValueError("No se encontró la fila de encabezado con 'SECCION'")
    return header, rows


def filas_municipio(rows: list[dict], code: str) -> list[dict]:
    muni_id = int(code[2:])
    out = [r for r in rows
           if _int(r.get("ID_MUNICIPIO")) == muni_id and _int(r.get("SECCION")) > 0]
    if not out:
        raise ValueError(f"El municipio {code} (ID_MUNICIPIO={muni_id}) no tiene filas")
    return out


def _tokens(col: str) -> list[str]:
    return [t for t in col.split("_") if t and t != "CC"]


def bloque_votos(row: dict, header: list[str], partidos: set[str]) -> int:
    total = 0
    for col in header:
        toks = _tokens(col)
        if toks and all(t in _PARTIDOS_CONOCIDOS for t in toks) and all(t in partidos for t in toks):
            total += _int(row.get(col))
    return total


def _rival_max(row: dict, header: list[str], anio: int) -> int:
    return max(bloque_votos(row, header, b) for b in BLOQUES[anio]["rivales"])


def secciones_2024(rows: list[dict], header: list[str]) -> list[dict]:
    out = []
    for r in sorted(rows, key=lambda x: _int(x["SECCION"])):
        propio = bloque_votos(r, header, BLOQUES[2024]["propio"])
        rival = _rival_max(r, header, 2024)
        votos, ln = _int(r.get("TOTAL_VOTOS")), _int(r.get("LISTA_NOMINAL"))
        margen = propio - rival
        out.append({
            "seccion": str(_int(r["SECCION"])),
            "lista_nominal": ln,
            "votos": votos,
            "participacion": round(votos / ln * 100, 1) if ln else 0.0,
            "coalicion": propio,
            "morena": rival,
            "margen": margen,
            "prioridad": clasificar_prioridad(margen),
        })
    return out


def intel_electoral(anio: int, rows: list[dict], header: list[str]) -> list[tuple]:
    ln = sum(_int(r.get("LISTA_NOMINAL")) for r in rows)
    votos = sum(_int(r.get("TOTAL_VOTOS")) for r in rows)
    validos = sum(_int(r.get("NUM_VOTOS_VALIDOS")) for r in rows) or votos
    propio = sum(bloque_votos(r, header, BLOQUES[anio]["propio"]) for r in rows)
    # Rival = el bloque rival más votado a nivel municipal (no por sección).
    rival = max(sum(bloque_votos(r, header, b) for r in rows) for b in BLOQUES[anio]["rivales"])
    margen = propio - rival
    out = [
        ("electoral", anio, "elec_lista_nominal", ln),
        ("electoral", anio, "elec_votos_totales", votos),
        ("electoral", anio, "elec_participacion", round(votos / ln * 100, 2) if ln else 0.0),
        ("electoral", anio, "elec_margen_votos", margen),
        ("electoral", anio, "elec_margen_pp", round(margen / validos * 100, 2) if validos else 0.0),
    ]
    if anio == 2024:
        out.append(("electoral", anio, "elec_casillas", sum(_int(r.get("CASILLAS")) for r in rows)))
    return out


def intel_voto2024(rows: list[dict], header: list[str]) -> list[tuple]:
    out = [("voto2024", 2024, f"voto_{p}", sum(_int(r.get(p)) for r in rows))
           for p in PARTIDOS_2024 if p in header]
    propio = sum(bloque_votos(r, header, BLOQUES[2024]["propio"]) for r in rows)
    rival = max(sum(bloque_votos(r, header, b) for r in rows) for b in BLOQUES[2024]["rivales"])
    out.append(("voto2024", 2024, "coalicion_ganadora_votos", max(propio, rival)))
    return out


def intel_secciones(secciones: list[dict]) -> list[tuple]:
    n = len(secciones)
    return [
        ("secciones", 2024, "secciones_total", n),
        ("secciones", 2024, "secciones_coalicion", sum(1 for s in secciones if s["margen"] > 0)),
        ("secciones", 2024, "secciones_morena", sum(1 for s in secciones if s["margen"] <= 0)),
        ("secciones", 2024, "secciones_persuadibles",
         sum(1 for s in secciones if abs(s["margen"]) <= UMBRAL_COMPETITIVA)),
        ("secciones", 2024, "participacion_prom_seccional",
         round(sum(s["participacion"] for s in secciones) / n, 1) if n else 0.0),
    ]


def _int(v) -> int:
    if v is None or v == "":
        return 0
    try:
        return int(v)
    except (TypeError, ValueError):
        return int(float(v))
