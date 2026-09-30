# Demo Atizapán de Zaragoza 2027 · Luis Montaño — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Arturo entre a PROD como ADMIN de su propia organización y vea la campaña "Atizapán de Zaragoza 2027 · Luis Montaño" poblada con territorio e inteligencia reales (IEEM/INEGI) de Atizapán y sus 6 municipios periféricos, más operación sintética suficiente para que todos los módulos (incluido Alertas) se vean vivos.

**Architecture:** (1) Un builder puro (`app/seeds/dataset_builder.py`) transforma los XLSX del IEEM y el ITER de INEGI en los CSV por municipio que ya consume la plataforma; un CLI lo envuelve. (2) Un registro de municipios (`app/seeds/municipios.py`) parametriza los tres seeds existentes y aporta etiquetas de bloque, región y prefijo de folio; la campaña gana `municipio_code/candidato/partido` y todas las lecturas de `SeccionElectoral` se acotan al municipio de la campaña. (3) Dos seeds gateados por env var crean la org nueva, re-domicilian a Arturo, crean campaña + 51 usuarios y generan la operación sintética una sola vez.

**Tech Stack:** FastAPI + SQLAlchemy 2 (mapped_column) + Alembic + pytest/SQLite; React 18 + Zustand + Vitest (`renderToStaticMarkup`); `openpyxl`, `httpx` (ya en requirements). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-30-demo-atizapan-luis-montano-design.md`

## Global Constraints

- Enum values en migraciones: NOMBRES en mayúsculas; esta migración no crea enums.
- Toda migración idempotente (`_column_exists` / `_index_exists`) y compatible con SQLite (`batch_alter_table`), patrón de `0020_minuta_sprint.py`.
- Golden rules: toda entidad de negocio filtra por `organization_id`; `organization_id` en escrituras viene del contexto, nunca del input; endpoints devuelven Pydantic; RBAC en API; error envelope `{error:{message,status}}` vía `HTTPException`.
- Clave de elector nunca se loguea ni se devuelve en listas; en seeds se cifra con `crypto.encrypt_clave` y se muestra `clave_masked`.
- Tests backend: `cd backend && python3 -m pytest -q` (SQLite en memoria; `FERNET_KEY` y `RATE_LIMIT_ENABLED=false` los fija `conftest.py`). Baseline actual: toda la suite verde antes de empezar.
- Frontend: `cd frontend && npm run build && npm run test`.
- Semántica de columnas `SeccionElectoral`: `coalicion` = bloque **propio**, `morena` = bloque **rival**, `margen = coalicion − morena`.
- Prioridad: `|margen| < 30` ALTA_PERSUADIBLE; `|margen| ≤ 150` COMPETITIVA; `margen > 150` DEFENDER_EXPANDIR; `margen < −150` RECUPERAR_OPOSICION.
- Códigos INEGI: Atizapán 15013, Tlalnepantla 15104, Naucalpan 15057, Nicolás Romero 15060, Cuautitlán Izcalli 15121, Isidro Fabela 15038, Jilotzingo 15046; SMA 15076. En el IEEM `ID_MUNICIPIO == int(code[2:])`.
- Correos demo `@demo.atizapan.mx`; contraseña común desde `SEED_DEMO_ATIZAPAN_PASSWORD`; org slug default `atizapan`.
- Commits pequeños por tarea con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **Una campaña sin `municipio_code`** (todas las existentes de tests y cualquier campaña creada por UI) debe seguir viendo todas las secciones en plan territorial / promovidos / militantes, no cero. → Test en Task 5 (`test_secciones_query_sin_municipio_no_filtra`).
2. **Re-domicilio con correo de un usuario que ya está en la org destino** o que no existe: no debe duplicar ni fallar el arranque. → Tests en Task 8 (`test_rehome_ya_en_org_no_cambia`, `test_rehome_usuario_inexistente_lo_crea`).
3. **Segundo arranque en PROD** (seeds corren en cada boot): territorio regional, campaña, usuarios y operación no deben duplicarse ni tardar minutos. → Tests de idempotencia en Task 4, 8 y 10 (marcador `promotor == "demo-seed"`).
4. **Fila `SECCION = 0` y municipio sin filas** en el XLSX: el builder debe descartar la fila 0 y fallar con mensaje claro si un código no aparece. → Tests en Task 1 (`test_descarta_seccion_cero`, `test_municipio_ausente_error`).
5. **Lucy (campaña 15076) y una campaña 15013 en la misma base**: `list_planes` y `panorama` no deben mezclar secciones. → Test en Task 5 (`test_list_planes_aisla_por_municipio`) y Task 6 (`test_panorama_por_codigo_no_mezcla`).

---

## File Structure

**Backend — crear**
- `backend/app/seeds/dataset_builder.py` — transformaciones puras IEEM/ITER → filas CSV (sin red).
- `backend/scripts/build_municipio_dataset.py` — CLI: descarga con caché, invoca el builder, escribe CSV + manifest.
- `backend/app/seeds/municipios.py` — `MunicipioConfig`, `MUNICIPIOS`, `REGIONES`.
- `backend/app/seeds/municipios/<code>/secciones_2024.csv`, `intel.csv`, `manifest.json` — 8 carpetas (15076 + 7).
- `backend/alembic/versions/0021_campaign_municipio.py`.
- `backend/app/seeds/demo_atizapan.py` — org, re-domicilio, campaña, usuarios.
- `backend/app/seeds/demo_atizapan_operacion.py` — datos sintéticos + listas de nombres/colonias.
- `backend/scripts/seed_atizapan_operacion.py` — CLI local `[--reset]`.
- `backend/tests/test_dataset_builder.py`, `test_municipios_registry.py`, `test_demo_atizapan.py`, `test_demo_atizapan_operacion.py`, `test_municipio_region.py`.

**Backend — modificar**
- `app/models/campaign.py`, `app/models/seccion_electoral.py`, `app/schemas/campaign.py`, `app/dependencies.py` (CampaignContext), `app/services/campaign_service.py`.
- `app/seeds/demo_territory.py`, `app/seeds/demo_municipio_intel.py`, `app/seeds/demo_election_date.py`, `app/bootstrap.py`, `app/main.py`.
- `app/services/territory_service.py` (nuevo `secciones_query`), `app/services/operacion_service.py`, `app/services/promovido_service.py`, `app/services/militante_service.py`, `app/services/municipio_service.py`, `app/routers/municipio.py`.
- `tests/test_seccion_electoral.py`, `tests/test_municipio.py` (ajustes a la API parametrizada).
- `docs/demo-atizapan.md` (nuevo guion sin contraseñas), `STATUS.md` (env vars), `CLAUDE.md` (sección corta).

**Frontend — modificar**
- `src/store/campaignStore.ts`, `src/api/municipio.ts`, `src/modules/municipio/PanoramaMunicipioPage.tsx`, `src/modules/municipio/regionHelpers.ts` (nuevo, puro), `src/modules/registry.ts:286`, `src/modules/militantes/CapturaMilitantePage.tsx`, `src/pages/DashboardPage.tsx`, `src/components/layout/CampaignSwitcher.tsx`.
- `src/modules/municipio/__tests__/regionHelpers.test.ts` (nuevo).

---

## Task 1: Builder puro — secciones 2024, bloques, prioridad, intel electoral

**Files:**
- Create: `backend/app/seeds/dataset_builder.py`
- Test: `backend/tests/test_dataset_builder.py`

**Interfaces:**
- Produces:
  - `BLOQUES: dict[int, dict]` — por año `{"propio": set[str], "rivales": list[set[str]]}`.
  - `clasificar_prioridad(margen: int) -> str`
  - `leer_hoja(ws) -> tuple[list[str], list[dict]]` — encabezado (fila que contiene `SECCION`) y filas como dict.
  - `filas_municipio(rows: list[dict], code: str) -> list[dict]` — filtra `ID_MUNICIPIO == int(code[2:])` y `SECCION > 0`; `ValueError` si vacío.
  - `bloque_votos(row: dict, header: list[str], partidos: set[str]) -> int` — suma de columnas cuyo nombre (tokens `_`, sin `CC`) ⊆ `partidos`.
  - `secciones_2024(rows: list[dict], header: list[str]) -> list[dict]` — filas con claves `seccion,lista_nominal,votos,participacion,coalicion,morena,margen,prioridad`.
  - `intel_electoral(anio: int, rows: list[dict], header: list[str]) -> list[tuple[str,int,str,float]]` — tuplas `(categoria, anio, indicador, valor)`.
  - `intel_voto2024(rows, header) -> list[tuple]`, `intel_secciones(secciones: list[dict]) -> list[tuple]`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_dataset_builder.py
"""Builder puro IEEM → CSV (sin red). Fixture XLSX in-memory con 2 municipios."""
import io

import openpyxl
import pytest

from app.seeds import dataset_builder as b

HDR_2024 = ["ID_ESTADO", "NOMBRE_ESTADO", "ID_DISTRITO_LOCAL", "CABECERA_DISTRITAL_LOCAL",
            "ID_MUNICIPIO", "MUNICIPIO", "SECCION", "CASILLAS", "ACTAS_CASILLA-MEC",
            "PAN", "PRI", "PRD", "PVEM", "PT", "MC", "MORENA", "NAEM",
            "PAN_PRI_PRD_NAEM", "PVEM_PT_MORENA", "CC_PAN_PRI_PRD_NAEM", "CAND_IND1",
            "NUM_VOTOS_VALIDOS", "NUM_VOTOS_CAN_NREG", "NUM_VOTOS_NULOS", "TOTAL_VOTOS", "LISTA_NOMINAL"]


def _row(muni_id, seccion, pan, pri, prd, pvem, pt, mc, morena, naem, coal, jhh, cc, ln):
    validos = pan + pri + prd + pvem + pt + mc + morena + naem + coal + jhh + cc
    total = validos + 3  # 3 nulos
    return [15, "MEXICO", 16, "CAB", muni_id, "M", seccion, 3, 3,
            pan, pri, prd, pvem, pt, mc, morena, naem, coal, jhh, cc, 0,
            validos, 0, 3, total, ln]


def _workbook():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Instituto Electoral"])   # filas de título como en el IEEM
    ws.append([])
    ws.append(HDR_2024)
    ws.append(_row(13, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 10))         # voto en tránsito
    ws.append(_row(13, 250, 600, 150, 30, 30, 10, 50, 230, 8, 20, 15, 4, 1800))  # rival gana amplio
    ws.append(_row(13, 251, 300, 100, 20, 40, 15, 30, 330, 5, 10, 40, 2, 1500))  # propio gana ~+
    ws.append(_row(13, 252, 200, 50, 10, 20, 10, 20, 230, 4, 5, 8, 1, 900))    # alta persuadible
    ws.append(_row(104, 900, 500, 100, 10, 10, 10, 10, 100, 1, 1, 1, 1, 1000)) # otro municipio
    return wb


def _hoja():
    wb = _workbook()
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return openpyxl.load_workbook(buf, read_only=True).worksheets[0]


def test_leer_hoja_localiza_encabezado():
    header, rows = b.leer_hoja(_hoja())
    assert header[6] == "SECCION"
    assert len(rows) == 5


def test_filas_municipio_descarta_seccion_cero_y_otros_municipios():
    header, rows = b.leer_hoja(_hoja())
    atz = b.filas_municipio(rows, "15013")
    assert [r["SECCION"] for r in atz] == [250, 251, 252]


def test_municipio_ausente_error():
    header, rows = b.leer_hoja(_hoja())
    with pytest.raises(ValueError, match="15999"):
        b.filas_municipio(rows, "15999")


def test_bloque_votos_suma_columnas_del_bloque():
    header, rows = b.leer_hoja(_hoja())
    r = b.filas_municipio(rows, "15013")[0]
    propio = b.bloque_votos(r, header, b.BLOQUES[2024]["propio"])
    rival = b.bloque_votos(r, header, b.BLOQUES[2024]["rivales"][0])
    assert propio == 30 + 10 + 230 + 15          # PVEM+PT+MORENA+PVEM_PT_MORENA
    assert rival == 600 + 150 + 30 + 8 + 20 + 4  # PAN+PRI+PRD+NAEM+PAN_PRI_PRD_NAEM+CC_...


@pytest.mark.parametrize("margen,esperado", [
    (0, "ALTA_PERSUADIBLE"), (29, "ALTA_PERSUADIBLE"), (-29, "ALTA_PERSUADIBLE"),
    (30, "COMPETITIVA"), (150, "COMPETITIVA"), (-150, "COMPETITIVA"),
    (151, "DEFENDER_EXPANDIR"), (-151, "RECUPERAR_OPOSICION"),
])
def test_clasificar_prioridad(margen, esperado):
    assert b.clasificar_prioridad(margen) == esperado


def test_secciones_2024_shape_y_valores():
    header, rows = b.leer_hoja(_hoja())
    secs = b.secciones_2024(b.filas_municipio(rows, "15013"), header)
    assert [s["seccion"] for s in secs] == ["250", "251", "252"]
    s = secs[0]
    assert s["coalicion"] == 285 and s["morena"] == 812 and s["margen"] == -527
    assert s["prioridad"] == "RECUPERAR_OPOSICION"
    assert s["votos"] == sum(int(rows[1][h]) for h in HDR_2024[9:21]) + 3
    assert s["lista_nominal"] == 1800
    assert s["participacion"] == round(s["votos"] / 1800 * 100, 1)
    assert secs[2]["prioridad"] == "ALTA_PERSUADIBLE"


def test_intel_electoral_2024_incluye_casillas_y_margen():
    header, rows = b.leer_hoja(_hoja())
    atz = b.filas_municipio(rows, "15013")
    tuplas = dict(((c, a, i), v) for c, a, i, v in b.intel_electoral(2024, atz, header))
    assert tuplas[("electoral", 2024, "elec_lista_nominal")] == 4200
    assert tuplas[("electoral", 2024, "elec_casillas")] == 9
    propio = sum(b.bloque_votos(r, header, b.BLOQUES[2024]["propio"]) for r in atz)
    rival = sum(b.bloque_votos(r, header, b.BLOQUES[2024]["rivales"][0]) for r in atz)
    assert tuplas[("electoral", 2024, "elec_margen_votos")] == propio - rival
    assert ("electoral", 2024, "elec_participacion") in tuplas


def test_intel_voto2024_y_secciones():
    header, rows = b.leer_hoja(_hoja())
    atz = b.filas_municipio(rows, "15013")
    voto = dict(((i), v) for _, _, i, v in b.intel_voto2024(atz, header))
    assert voto["voto_MORENA"] == 230 + 330 + 230
    assert voto["voto_PAN"] == 600 + 300 + 200
    assert voto["coalicion_ganadora_votos"] == max(
        sum(b.bloque_votos(r, header, b.BLOQUES[2024]["propio"]) for r in atz),
        sum(b.bloque_votos(r, header, b.BLOQUES[2024]["rivales"][0]) for r in atz))
    secs = b.secciones_2024(atz, header)
    res = dict(((i), v) for _, _, i, v in b.intel_secciones(secs))
    assert res["secciones_total"] == 3
    assert res["secciones_coalicion"] + res["secciones_morena"] == 3
    assert res["secciones_persuadibles"] == sum(1 for s in secs if abs(s["margen"]) <= 150)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_dataset_builder.py -q`
Expected: FAIL / ERROR con `ModuleNotFoundError: app.seeds.dataset_builder`.

- [ ] **Step 3: Write the builder**

```python
# backend/app/seeds/dataset_builder.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_dataset_builder.py -q`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/seeds/dataset_builder.py backend/tests/test_dataset_builder.py
git commit -m "feat(dataset): builder puro IEEM→secciones/intel con bloques por año y prioridad"
```

---

## Task 2: ITER socio + manifest + CLI, y generar los 8 datasets

**Files:**
- Modify: `backend/app/seeds/dataset_builder.py` (añadir `intel_socio_iter`, `escribir_csvs`)
- Create: `backend/scripts/build_municipio_dataset.py`
- Create: `backend/app/seeds/municipios/{15013,15104,15057,15060,15121,15038,15046}/{secciones_2024.csv,intel.csv,manifest.json}`
- Test: `backend/tests/test_dataset_builder.py` (añadir)

**Interfaces:**
- Produces:
  - `intel_socio_iter(iter_rows: Iterable[dict], code: str) -> list[tuple]` — fila municipal `MUN == code[2:]` y `LOC == "0000"`.
  - `escribir_csvs(out_dir: Path, secciones: list[dict], intel: list[tuple]) -> None` — escribe `secciones_2024.csv` e `intel.csv` con los encabezados exactos de SMA.
  - CLI: `python3 scripts/build_municipio_dataset.py --region atizapan | --municipio <code>... [--out app/seeds/municipios] [--cache .cache/datasets] [--coneval <xlsx>]`.
  - Constantes `REGION_ATIZAPAN = ["15013","15104","15057","15060","15121","15038","15046"]` en el script.

- [ ] **Step 1: Write the failing tests (append)**

```python
# append to backend/tests/test_dataset_builder.py
import csv
from pathlib import Path


def _iter_rows():
    return [
        {"ENTIDAD": "15", "MUN": "013", "NOM_MUN": "Atizapán de Zaragoza", "LOC": "0001",
         "POBTOT": "5", "POBFEM": "3", "POBMAS": "2", "P_18YMAS": "4", "TVIVHAB": "2",
         "HOGJEF_F": "1", "TOTHOG": "2", "GRAPROES": "9.5", "PSINDER": "1", "VPH_INTER": "1"},
        {"ENTIDAD": "15", "MUN": "013", "NOM_MUN": "Atizapán de Zaragoza", "LOC": "0000",
         "POBTOT": "1000", "POBFEM": "520", "POBMAS": "480", "P_18YMAS": "750", "TVIVHAB": "300",
         "HOGJEF_F": "100", "TOTHOG": "300", "GRAPROES": "11.06", "PSINDER": "250", "VPH_INTER": "210"},
        {"ENTIDAD": "15", "MUN": "104", "NOM_MUN": "Tlalnepantla", "LOC": "0000",
         "POBTOT": "9", "POBFEM": "4", "POBMAS": "5", "P_18YMAS": "7", "TVIVHAB": "3",
         "HOGJEF_F": "1", "TOTHOG": "3", "GRAPROES": "10", "PSINDER": "2", "VPH_INTER": "2"},
    ]


def test_intel_socio_iter_toma_fila_municipal_y_deriva_porcentajes():
    socio = dict((i, v) for _, _, i, v in b.intel_socio_iter(_iter_rows(), "15013"))
    assert socio["poblacion"] == 1000
    assert socio["pct_mujeres"] == 52.0 and socio["pct_hombres"] == 48.0
    assert socio["viviendas"] == 300
    assert socio["pct_jefa_hogar"] == round(100 / 300 * 100, 1)
    assert socio["pob_18_mas"] == 750
    assert socio["grado_escolaridad"] == 11.06
    assert socio["pct_sin_derechohabiencia"] == 25.0
    assert socio["pct_viviendas_internet"] == 70.0


def test_intel_socio_iter_municipio_ausente_error():
    with pytest.raises(ValueError, match="15999"):
        b.intel_socio_iter(_iter_rows(), "15999")


def test_escribir_csvs_usa_encabezados_de_sma(tmp_path: Path):
    header, rows = b.leer_hoja(_hoja())
    atz = b.filas_municipio(rows, "15013")
    secs = b.secciones_2024(atz, header)
    intel = b.intel_electoral(2024, atz, header) + b.intel_secciones(secs)
    b.escribir_csvs(tmp_path, secs, intel)
    with (tmp_path / "secciones_2024.csv").open(encoding="utf-8") as f:
        r = csv.reader(f)
        assert next(r) == ["seccion", "lista_nominal", "votos", "participacion",
                           "coalicion", "morena", "margen", "prioridad"]
        assert len(list(r)) == 3
    with (tmp_path / "intel.csv").open(encoding="utf-8") as f:
        r = csv.reader(f)
        assert next(r) == ["categoria", "anio", "indicador", "valor"]
        assert ["electoral", "2024", "elec_casillas", "9"] in list(r)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_dataset_builder.py -q`
Expected: 3 FAIL con `AttributeError: ... has no attribute 'intel_socio_iter'`.

- [ ] **Step 3: Implement socio + escritura + CLI**

Append to `backend/app/seeds/dataset_builder.py`:

```python
import csv
from pathlib import Path

SECCIONES_HEADER = ["seccion", "lista_nominal", "votos", "participacion",
                    "coalicion", "morena", "margen", "prioridad"]
INTEL_HEADER = ["categoria", "anio", "indicador", "valor"]


def intel_socio_iter(iter_rows: Iterable[dict], code: str) -> list[tuple]:
    mun = code[2:].zfill(3)
    fila = next((r for r in iter_rows
                 if str(r.get("MUN", "")).zfill(3) == mun and str(r.get("LOC", "")) == "0000"), None)
    if fila is None:
        raise ValueError(f"ITER: no hay fila municipal (LOC=0000) para {code}")
    pob = _num(fila["POBTOT"]); viv = _num(fila["TVIVHAB"]); hog = _num(fila["TOTHOG"])
    pct = lambda a, b: round(a / b * 100, 1) if b else 0.0  # noqa: E731
    return [
        ("socio", 2020, "poblacion", int(pob)),
        ("socio", 2020, "pct_mujeres", pct(_num(fila["POBFEM"]), pob)),
        ("socio", 2020, "pct_hombres", pct(_num(fila["POBMAS"]), pob)),
        ("socio", 2020, "viviendas", int(viv)),
        ("socio", 2020, "pct_jefa_hogar", pct(_num(fila["HOGJEF_F"]), hog)),
        ("socio", 2020, "pob_18_mas", int(_num(fila["P_18YMAS"]))),
        ("socio", 2020, "grado_escolaridad", _num(fila["GRAPROES"])),
        ("socio", 2020, "pct_sin_derechohabiencia", pct(_num(fila["PSINDER"]), pob)),
        ("socio", 2020, "pct_viviendas_internet", pct(_num(fila["VPH_INTER"]), viv)),
    ]


def escribir_csvs(out_dir: Path, secciones: list[dict], intel: list[tuple]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "secciones_2024.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=SECCIONES_HEADER)
        w.writeheader()
        w.writerows(secciones)
    with (out_dir / "intel.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(INTEL_HEADER)
        for cat, anio, ind, val in intel:
            w.writerow([cat, anio, ind, _fmt(val)])


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0  # ITER usa "*" / "N/D" para datos protegidos


def _fmt(v) -> str:
    return str(int(v)) if isinstance(v, (int,)) or (isinstance(v, float) and v.is_integer()) else str(v)
```

Create `backend/scripts/build_municipio_dataset.py`:

```python
"""CLI: genera app/seeds/municipios/<code>/{secciones_2024.csv,intel.csv,manifest.json}
desde fuentes públicas (IEEM 2018/2021/2024 por sección + INEGI ITER 2020).

  python3 scripts/build_municipio_dataset.py --region atizapan
  python3 scripts/build_municipio_dataset.py --municipio 15013 --municipio 15104 [--coneval ruta.xlsx]

Nunca corre en producción. Descargas cacheadas en --cache (default .cache/datasets, git-ignored).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import sys
import zipfile
from datetime import date
from pathlib import Path

import httpx
import openpyxl

from app.seeds import dataset_builder as b

REGION_ATIZAPAN = ["15013", "15104", "15057", "15060", "15121", "15038", "15046"]
IEEM = {
    2024: "https://www.ieem.org.mx/assets/docs/procesos-electorales/resultados/2024/Ayuntamientos/Resultados_definitivos_ayu_seccion.xlsx",
    2021: "https://www.ieem.org.mx/assets/docs/procesos-electorales/resultados/2021/RESULTADOS%20DEFINITIVOS%20INTEGRANTES%20DE%20LOS%20AYUNTAMIENTOS/RESULTADOS%20POR%20SECCION%20ELECION%20AYUNTAMIENTOS%202021.xlsx",
    2018: "https://www.ieem.org.mx/assets/docs/procesos-electorales/resultados/2018/2018_SEE_AYUN_MEX_SEC.xlsx",
}
ITER_URL = "https://www.inegi.org.mx/contenidos/programas/ccpv/2020/datosabiertos/iter/iter_15_cpv2020_csv.zip"


def fetch(url: str, cache: Path) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    dest = cache / hashlib.sha1(url.encode()).hexdigest()[:12]
    if not dest.exists():
        print(f"↓ {url}")
        with httpx.stream("GET", url, follow_redirects=True, timeout=180) as r:
            r.raise_for_status()
            with dest.open("wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
    return dest


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def leer_iter(zip_path: Path) -> list[dict]:
    with zipfile.ZipFile(zip_path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".csv") and "conjunto_de_datos" in n)
        raw = z.read(name)
    try:
        txt = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        txt = raw.decode("latin-1")
    return list(csv.DictReader(io.StringIO(txt)))


def leer_coneval(xlsx: Path, code: str) -> list[tuple]:
    """Mejor esfuerzo: busca una fila cuyo primer valor numérico sea la clave municipal
    (15013) y columnas que contengan 'pobreza moderada', 'pobreza extrema', 'vulnerable'.
    Devuelve [] si no encuentra nada (y el manifest lo anota)."""
    ws = openpyxl.load_workbook(xlsx, read_only=True, data_only=True).worksheets[0]
    header = None
    for r in ws.iter_rows(values_only=True):
        cells = [str(c).strip().lower() if c is not None else "" for c in r]
        if header is None and any("pobreza" in c for c in cells):
            header = cells
            continue
        if header and any(str(c) == code for c in r):
            row = dict(zip(header, r))
            def col(frag):
                k = next((h for h in header if frag in h and "porcentaje" in h), None)
                return float(row[k]) if k and row.get(k) not in (None, "") else None
            out = []
            for ind, frag in (("pobreza_moderada_pct", "pobreza moderada"),
                              ("pobreza_extrema_pct", "pobreza extrema"),
                              ("vulnerable_carencias_pct", "vulnerable por carencias")):
                v = col(frag)
                if v is not None:
                    out.append(("socio", 2020, ind, round(v, 2)))
            return out
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--municipio", action="append", default=[])
    ap.add_argument("--region", choices=["atizapan"])
    ap.add_argument("--out", default="app/seeds/municipios")
    ap.add_argument("--cache", default=".cache/datasets")
    ap.add_argument("--coneval", default=None)
    args = ap.parse_args()
    codes = list(args.municipio) + (REGION_ATIZAPAN if args.region == "atizapan" else [])
    if not codes:
        ap.error("indica --municipio o --region")
    cache = Path(args.cache)

    fuentes = {}
    hojas = {}
    for anio, url in IEEM.items():
        p = fetch(url, cache)
        fuentes[f"ieem_{anio}"] = {"url": url, "sha256": sha256(p)}
        ws = openpyxl.load_workbook(p, read_only=True).worksheets[0]
        hojas[anio] = b.leer_hoja(ws)
    iter_zip = fetch(ITER_URL, cache)
    fuentes["inegi_iter_2020"] = {"url": ITER_URL, "sha256": sha256(iter_zip)}
    iter_rows = leer_iter(iter_zip)

    for code in codes:
        header24, rows24 = hojas[2024]
        atz24 = b.filas_municipio(rows24, code)
        secs = b.secciones_2024(atz24, header24)
        intel: list[tuple] = []
        omitidos: list[str] = []
        for anio in (2018, 2021, 2024):
            header, rows = hojas[anio]
            try:
                intel += b.intel_electoral(anio, b.filas_municipio(rows, code), header)
            except ValueError as e:
                omitidos.append(f"electoral {anio}: {e}")
        intel += b.intel_voto2024(atz24, header24)
        intel += b.intel_secciones(secs)
        intel += b.intel_socio_iter(iter_rows, code)
        if args.coneval:
            cv = leer_coneval(Path(args.coneval), code)
            intel += cv
            if not cv:
                omitidos.append("coneval: sin fila para el municipio")
        else:
            omitidos.append("coneval: no se pasó --coneval (pobreza_*_pct omitidos)")
        omitidos.append("movilidad/crecimiento_pct_2010_2020/pct_pob_5_19: no están en ITER básico")

        out_dir = Path(args.out) / code
        b.escribir_csvs(out_dir, secs, intel)
        (out_dir / "manifest.json").write_text(json.dumps({
            "municipio": code, "generado": date.today().isoformat(),
            "fuentes": fuentes, "secciones": len(secs),
            "umbrales_prioridad": {"alta_persuadible_lt": b.UMBRAL_ALTA, "competitiva_le": b.UMBRAL_COMPETITIVA},
            "bloques": {str(k): {"propio": sorted(v["propio"]), "rivales": [sorted(x) for x in v["rivales"]]}
                        for k, v in b.BLOQUES.items()},
            "omitidos": omitidos,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{code}: {len(secs)} secciones, {len(intel)} indicadores → {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Add `.cache/` to `backend/.gitignore` (append line `.cache/`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_dataset_builder.py -q`
Expected: 13 passed.

- [ ] **Step 5: Generate the real datasets (network)**

Run: `cd backend && python3 scripts/build_municipio_dataset.py --region atizapan`
Expected (stdout): 7 líneas; `15013: 174 secciones`, `15104: 385`, `15057: 460`, `15060: 110`, `15121: 262`, `15038: 5`, `15046: 10`.
Verify: `grep -c "" app/seeds/municipios/15013/secciones_2024.csv` → `175` (encabezado + 174). `grep elec_margen_votos app/seeds/municipios/15013/intel.csv` → tres filas (2018, 2021, 2024); la de 2024 debe ser `-33809`. `awk -F, 'NR>1{c[$8]++}END{for(k in c)print k,c[k]}' app/seeds/municipios/15013/secciones_2024.csv` → `RECUPERAR_OPOSICION 82`, `DEFENDER_EXPANDIR 41`, `COMPETITIVA 36`, `ALTA_PERSUADIBLE 15`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/seeds/dataset_builder.py backend/scripts/build_municipio_dataset.py backend/tests/test_dataset_builder.py backend/.gitignore backend/app/seeds/municipios/
git commit -m "feat(dataset): CLI IEEM/ITER + datasets reales de Atizapán y 6 municipios periféricos"
```

---

## Task 3: Migración 0021 + modelos + schemas + `CampaignContext.municipio_code`

**Files:**
- Create: `backend/alembic/versions/0021_campaign_municipio.py`
- Modify: `backend/app/models/campaign.py:28-38`, `backend/app/models/seccion_electoral.py:19-28`, `backend/app/schemas/campaign.py`, `backend/app/dependencies.py:98-130`, `backend/app/services/campaign_service.py:22-29`
- Test: `backend/tests/test_campaigns.py` (append)

**Interfaces:**
- Produces: `Campaign.municipio_code: Optional[str]`, `Campaign.candidato: Optional[str]`, `Campaign.partido: Optional[str]`; `SeccionElectoral.municipio_code: Optional[str]`; `CampaignContext.municipio_code: Optional[str] = None` (poblado por `get_campaign_context`); `CampaignCreate/CampaignOut` con los 3 campos opcionales.

- [ ] **Step 1: Write the failing tests (append to `tests/test_campaigns.py`)**

```python
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers
from app.models.campaign import Campaign


def test_campaign_create_and_read_municipio_candidato(client):
    h = auth_headers(client, "admin@alpha.gov")
    r = client.post("/api/campaigns", headers=h, json={
        "name": "Atizapán Test 2027", "cycle": 2027,
        "municipio_code": "15013", "candidato": "Luis Montaño", "partido": "Morena-PVEM-PT"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["municipio_code"] == "15013"
    assert body["candidato"] == "Luis Montaño" and body["partido"] == "Morena-PVEM-PT"
    mine = client.get("/api/campaigns/mine", headers=h).json()
    alpha = next(c for c in mine if c["id"] == ALPHA_CAMPAIGN_ID)
    assert alpha["municipio_code"] is None  # campos opcionales, nullables


def test_campaign_context_carries_municipio_code():
    from app.dependencies import CampaignContext
    ctx = CampaignContext(user=None, organization_id="o", role=None, campaign_id="c")
    assert ctx.municipio_code is None
    ctx2 = CampaignContext(user=None, organization_id="o", role=None, campaign_id="c", municipio_code="15013")
    assert ctx2.municipio_code == "15013"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_campaigns.py -q`
Expected: 2 FAIL (`KeyError: 'municipio_code'` / `TypeError: unexpected keyword 'municipio_code'`).

- [ ] **Step 3: Implement**

`backend/alembic/versions/0021_campaign_municipio.py`:

```python
"""0021 campaign municipio/candidato/partido + seccion_electoral.municipio_code

Revision ID: 0021_campaign_municipio
Revises: 0020_minuta_sprint
"""
from alembic import op
import sqlalchemy as sa

revision = "0021_campaign_municipio"
down_revision = "0020_minuta_sprint"
branch_labels = None
depends_on = None


def _insp():
    return sa.inspect(op.get_bind())


def _column_exists(table: str, col: str) -> bool:
    return any(c["name"] == col for c in _insp().get_columns(table))


def _index_exists(table: str, name: str) -> bool:
    return any(ix["name"] == name for ix in _insp().get_indexes(table))


def upgrade() -> None:
    with op.batch_alter_table("campaigns") as batch:
        if not _column_exists("campaigns", "municipio_code"):
            batch.add_column(sa.Column("municipio_code", sa.String(10), nullable=True))
        if not _column_exists("campaigns", "candidato"):
            batch.add_column(sa.Column("candidato", sa.String(160), nullable=True))
        if not _column_exists("campaigns", "partido"):
            batch.add_column(sa.Column("partido", sa.String(60), nullable=True))
    if not _index_exists("campaigns", "ix_campaigns_municipio_code"):
        op.create_index("ix_campaigns_municipio_code", "campaigns", ["municipio_code"])

    if not _column_exists("seccion_electoral", "municipio_code"):
        with op.batch_alter_table("seccion_electoral") as batch:
            batch.add_column(sa.Column("municipio_code", sa.String(10), nullable=True))
    if not _index_exists("seccion_electoral", "ix_seccion_electoral_municipio_code"):
        op.create_index("ix_seccion_electoral_municipio_code", "seccion_electoral", ["municipio_code"])
    # Backfill SMA (único municipio previo): las filas se sembraron con el nombre como llave.
    op.execute(
        "UPDATE seccion_electoral SET municipio_code = '15076' "
        "WHERE municipio = 'San Mateo Atenco' AND municipio_code IS NULL"
    )


def downgrade() -> None:
    if _index_exists("seccion_electoral", "ix_seccion_electoral_municipio_code"):
        op.drop_index("ix_seccion_electoral_municipio_code", table_name="seccion_electoral")
    if _column_exists("seccion_electoral", "municipio_code"):
        with op.batch_alter_table("seccion_electoral") as batch:
            batch.drop_column("municipio_code")
    if _index_exists("campaigns", "ix_campaigns_municipio_code"):
        op.drop_index("ix_campaigns_municipio_code", table_name="campaigns")
    with op.batch_alter_table("campaigns") as batch:
        for col in ("partido", "candidato", "municipio_code"):
            if _column_exists("campaigns", col):
                batch.drop_column(col)
```

`app/models/campaign.py` — añadir en `Campaign` tras `meta_afiliacion`:

```python
    # Municipio INEGI (p. ej. "15013") que acota las secciones de la campaña; NULL = sin acotar.
    municipio_code: Mapped[Optional[str]] = mapped_column(String(10), index=True, nullable=True)
    candidato: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    partido: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
```

`app/models/seccion_electoral.py` — añadir tras `municipio`:

```python
    municipio_code: Mapped[Optional[str]] = mapped_column(String(10), index=True, nullable=True)
```

`app/schemas/campaign.py`:

```python
class CampaignCreate(BaseModel):
    name: str
    cycle: int
    municipio_code: Optional[str] = None
    candidato: Optional[str] = None
    partido: Optional[str] = None


class CampaignOut(BaseModel):
    id: str
    name: str
    cycle: int
    status: str
    license_tier: str
    municipio_code: Optional[str] = None
    candidato: Optional[str] = None
    partido: Optional[str] = None

    class Config:
        from_attributes = True
```

`app/services/campaign_service.py:23`:

```python
    c = Campaign(name=data.name, cycle=data.cycle, organization_id=ctx.organization_id,
                 created_by=ctx.user.id, municipio_code=data.municipio_code,
                 candidato=data.candidato, partido=data.partido)
```

`app/dependencies.py`:

```python
@dataclass(frozen=True)
class CampaignContext(TenantContext):
    campaign_id: str = ""
    municipio_code: Optional[str] = None
```

y al final de `get_campaign_context`:

```python
    return CampaignContext(
        user=ctx.user, organization_id=organization_id, role=ctx.role,
        campaign_id=x_campaign_id, municipio_code=campaign.municipio_code,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_campaigns.py tests/test_admin_context.py -q`
Expected: all passed (los tests de contexto existentes siguen construyendo `CampaignContext` sin el campo nuevo).

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0021_campaign_municipio.py backend/app/models/campaign.py backend/app/models/seccion_electoral.py backend/app/schemas/campaign.py backend/app/services/campaign_service.py backend/app/dependencies.py backend/tests/test_campaigns.py
git commit -m "feat(campaign): municipio_code/candidato/partido + seccion_electoral.municipio_code (0021)"
```

---

## Task 4: Registro de municipios y seeds parametrizados (territorio, intel, fecha de elección)

**Files:**
- Create: `backend/app/seeds/municipios.py`, `backend/tests/test_municipios_registry.py`
- Move: `backend/app/seeds/san_mateo_atenco_secciones_2024.csv` → `backend/app/seeds/municipios/15076/secciones_2024.csv`; `san_mateo_atenco_intel.csv` → `municipios/15076/intel.csv`
- Modify: `backend/app/seeds/demo_territory.py`, `backend/app/seeds/demo_municipio_intel.py`, `backend/app/seeds/demo_election_date.py`, `backend/app/bootstrap.py:214-229`, `backend/app/main.py:81-106`, `backend/tests/test_seccion_electoral.py`, `backend/tests/test_municipio.py`

**Interfaces:**
- Produces:
  - `MunicipioConfig(code, name, region, data_dir, bloque_propio, bloque_rival, folio_prefix, extra_secciones)`; `MUNICIPIOS: dict[str, MunicipioConfig]`; `REGIONES: dict[str,str]`; `municipios_de_region(region: str) -> list[MunicipioConfig]`; `config_de(code: str) -> Optional[MunicipioConfig]`.
  - `seed_territory(db, cfg) -> None`; `seed_all_territories(db) -> None` (antes `seed_demo_territory`; se conserva el alias `seed_demo_territory = seed_all_territories`).
  - `seed_intel(db, cfg) -> None`; `seed_municipio_intel(db) -> None` (todos).
  - `seed_election_date(db) -> None` — ahora para toda campaña con `municipio_code` en el registro; fija `Contest.territory_id`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_municipios_registry.py
from app.seeds.municipios import MUNICIPIOS, REGIONES, config_de, municipios_de_region


def test_registro_tiene_sma_y_region_atizapan():
    assert MUNICIPIOS["15076"].region == "toluca"
    atz = municipios_de_region("atizapan")
    assert [m.code for m in atz][0] == "15013"
    assert {m.code for m in atz} == {"15013", "15104", "15057", "15060", "15121", "15038", "15046"}
    assert REGIONES["atizapan"] == "Atizapán y periferia"


def test_config_bloques_y_folio():
    atz = config_de("15013")
    assert atz.bloque_propio == "Morena-PVEM-PT" and atz.bloque_rival == "PAN-PRI-PRD"
    assert atz.folio_prefix == "ATZ"
    sma = config_de("15076")
    assert sma.folio_prefix == "SMA" and sma.extra_secciones == ("4127",)
    assert config_de("99999") is None


def test_todos_los_csv_existen():
    for cfg in MUNICIPIOS.values():
        assert (cfg.data_dir / "secciones_2024.csv").exists(), cfg.code
        assert (cfg.data_dir / "intel.csv").exists(), cfg.code
```

Replace `backend/tests/test_seccion_electoral.py` entirely:

```python
"""Seed de territorio parametrizado — SMA + matriz seccional 2024 + aislamiento por municipio."""
from sqlalchemy import func, select

from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.seccion_electoral import SeccionElectoral
from app.seeds.demo_territory import seed_territory
from app.seeds.municipios import MUNICIPIOS
from tests.conftest import TestingSessionLocal

SMA = MUNICIPIOS["15076"]
ATZ = MUNICIPIOS["15013"]


def _n_secciones(db, code):
    return db.execute(select(func.count()).select_from(SeccionElectoral).where(
        SeccionElectoral.anio == 2024, SeccionElectoral.municipio_code == code)).scalar_one()


def test_seed_creates_municipio_secciones_and_matrix():
    db = TestingSessionLocal()
    try:
        seed_territory(db, SMA)
        muni = db.execute(select(ElectoralArea).where(ElectoralArea.code == "15076")).scalar_one()
        assert muni.level == AreaLevel.MUNICIPIO
        n_sec = db.execute(select(func.count()).select_from(ElectoralArea).where(
            ElectoralArea.level == AreaLevel.SECCION, ElectoralArea.municipio_id == muni.id)).scalar_one()
        assert n_sec == 23  # 22 de la matriz + la extra 4127
        assert _n_secciones(db, "15076") == 22
        row = db.execute(select(SeccionElectoral).where(SeccionElectoral.seccion == "4121")).scalar_one()
        assert row.margen == -115 and row.prioridad == "COMPETITIVA" and row.municipio_code == "15076"
        assert db.execute(select(SeccionElectoral).where(SeccionElectoral.seccion == "4127")).scalar_one_or_none() is None
    finally:
        db.close()


def test_seed_is_idempotent_and_reconciles_missing_code():
    db = TestingSessionLocal()
    try:
        seed_territory(db, SMA)
        # Simula una fila previa a 0021 (sin municipio_code) y verifica que el seed la reconcilia.
        row = db.execute(select(SeccionElectoral).where(SeccionElectoral.seccion == "4121")).scalar_one()
        row.municipio_code = None
        db.commit()
        seed_territory(db, SMA)
        db.refresh(row)
        assert row.municipio_code == "15076"
        assert _n_secciones(db, "15076") == 22
        n_area = db.execute(select(func.count()).select_from(ElectoralArea).where(ElectoralArea.code == "15076")).scalar_one()
        assert n_area == 1
    finally:
        db.close()


def test_seed_atizapan_no_mezcla_con_sma():
    db = TestingSessionLocal()
    try:
        seed_territory(db, SMA)
        seed_territory(db, ATZ)
        assert _n_secciones(db, "15013") == 174
        assert _n_secciones(db, "15076") == 22
        muni = db.execute(select(ElectoralArea).where(ElectoralArea.code == "15013")).scalar_one()
        assert muni.name == "Atizapán de Zaragoza"
    finally:
        db.close()
```

In `backend/tests/test_municipio.py`, change the import and `_seed_study`'s seed call:

```python
from app.seeds.demo_municipio_intel import seed_intel
from app.seeds.municipios import MUNICIPIOS
# ...
        for code, morena, coal, margen in [...]:
            ...
                db.add(SeccionElectoral(
                    seccion=code, municipio="San Mateo Atenco", municipio_code=_MUNI, anio=2024, ...))
        db.commit()
        seed_intel(db, MUNICIPIOS[_MUNI])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_municipios_registry.py tests/test_seccion_electoral.py tests/test_municipio.py -q`
Expected: ImportError en los tres archivos.

- [ ] **Step 3: Implement**

Move the CSVs:

```bash
cd backend && mkdir -p app/seeds/municipios/15076 && git mv app/seeds/san_mateo_atenco_secciones_2024.csv app/seeds/municipios/15076/secciones_2024.csv && git mv app/seeds/san_mateo_atenco_intel.csv app/seeds/municipios/15076/intel.csv
```

`backend/app/seeds/municipios.py`:

```python
"""Registro estático de municipios con datos sembrados (territorio + inteligencia).

Semántica de la matriz seccional (``SeccionElectoral``): ``coalicion`` = bloque PROPIO de la
campaña, ``morena`` = bloque RIVAL, ``margen = coalicion - morena``. Las etiquetas visibles
salen de aquí, no del nombre de la columna. La región es una constante de agrupación para
el selector/comparación del panorama; no es una entidad.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

_BASE = Path(__file__).parent / "municipios"


@dataclass(frozen=True)
class MunicipioConfig:
    code: str
    name: str
    region: str
    bloque_propio: str
    bloque_rival: str
    folio_prefix: str
    extra_secciones: tuple[str, ...] = ()

    @property
    def data_dir(self) -> Path:
        return _BASE / self.code


REGIONES: dict[str, str] = {"atizapan": "Atizapán y periferia", "toluca": "Valle de Toluca"}

_ATZ = dict(region="atizapan", bloque_propio="Morena-PVEM-PT", bloque_rival="PAN-PRI-PRD")

MUNICIPIOS: dict[str, MunicipioConfig] = {m.code: m for m in (
    MunicipioConfig("15076", "San Mateo Atenco", "toluca", "Coalición", "Morena", "SMA", ("4127",)),
    MunicipioConfig("15013", "Atizapán de Zaragoza", folio_prefix="ATZ", **_ATZ),
    MunicipioConfig("15104", "Tlalnepantla de Baz", folio_prefix="TLA", **_ATZ),
    MunicipioConfig("15057", "Naucalpan de Juárez", folio_prefix="NAU", **_ATZ),
    MunicipioConfig("15060", "Nicolás Romero", folio_prefix="NRO", **_ATZ),
    MunicipioConfig("15121", "Cuautitlán Izcalli", folio_prefix="CIZ", **_ATZ),
    MunicipioConfig("15038", "Isidro Fabela", folio_prefix="IFA", **_ATZ),
    MunicipioConfig("15046", "Jilotzingo", folio_prefix="JIL", **_ATZ),
)}


def config_de(code: Optional[str]) -> Optional[MunicipioConfig]:
    return MUNICIPIOS.get(code or "")


def municipios_de_region(region: str) -> list[MunicipioConfig]:
    """Orden de inserción del registro (Atizapán primero en su región)."""
    return [m for m in MUNICIPIOS.values() if m.region == region]
```

`backend/app/seeds/demo_territory.py` (reemplazar completo):

```python
"""Seed idempotente de territorio por municipio: ElectoralArea MUNICIPIO + SECCION y la
matriz electoral 2024 (SeccionElectoral) desde ``municipios/<code>/secciones_2024.csv``."""
from __future__ import annotations

import csv

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.seccion_electoral import SeccionElectoral
from app.seeds.municipios import MUNICIPIOS, MunicipioConfig

_ANIO = 2024


def _area_seccion(db: Session, code: str, muni: ElectoralArea) -> None:
    area = db.execute(select(ElectoralArea).where(
        ElectoralArea.code == code, ElectoralArea.level == AreaLevel.SECCION)).scalar_one_or_none()
    if area is None:
        db.add(ElectoralArea(name=f"Sección {code}", code=code, level=AreaLevel.SECCION,
                             organization_id=None, municipio_id=muni.id, parent_id=muni.id))
    elif area.municipio_id is None or area.parent_id is None:
        area.municipio_id = muni.id
        area.parent_id = muni.id


def seed_territory(db: Session, cfg: MunicipioConfig) -> None:
    muni = db.execute(select(ElectoralArea).where(
        ElectoralArea.code == cfg.code, ElectoralArea.level == AreaLevel.MUNICIPIO)).scalar_one_or_none()
    if muni is None:
        muni = ElectoralArea(name=cfg.name, code=cfg.code, level=AreaLevel.MUNICIPIO, organization_id=None)
        db.add(muni)
        db.flush()

    existentes = {f.seccion: f for f in db.execute(select(SeccionElectoral).where(
        SeccionElectoral.anio == _ANIO)).scalars()}
    with (cfg.data_dir / "secciones_2024.csv").open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            code = r["seccion"]
            _area_seccion(db, code, muni)
            fact = existentes.get(code)
            if fact is None:
                db.add(SeccionElectoral(
                    seccion=code, municipio=cfg.name, municipio_code=cfg.code, anio=_ANIO,
                    lista_nominal=int(r["lista_nominal"]), votos=int(r["votos"]),
                    participacion=float(r["participacion"]), coalicion=int(r["coalicion"]),
                    morena=int(r["morena"]), margen=int(r["margen"]), prioridad=r["prioridad"]))
            elif fact.municipio_code != cfg.code:
                fact.municipio_code = cfg.code   # reconcilia filas previas a 0021
    for code in cfg.extra_secciones:
        _area_seccion(db, code, muni)
    db.commit()


def seed_all_territories(db: Session) -> None:
    for cfg in MUNICIPIOS.values():
        seed_territory(db, cfg)


seed_demo_territory = seed_all_territories  # alias histórico (lifespan/tests antiguos)
```

`backend/app/seeds/demo_municipio_intel.py` (reemplazar completo):

```python
"""Seed idempotente de inteligencia municipal (CensusMetric) desde ``municipios/<code>/intel.csv``."""
from __future__ import annotations

import csv

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.census import CensusMetric
from app.seeds.municipios import MUNICIPIOS, MunicipioConfig

_NIVEL = "MUNICIPIO"


def seed_intel(db: Session, cfg: MunicipioConfig) -> None:
    existentes = {(m.anio, m.indicador) for m in db.execute(select(CensusMetric).where(
        CensusMetric.nivel == _NIVEL, CensusMetric.territory_code == cfg.code)).scalars()}
    with (cfg.data_dir / "intel.csv").open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            key = (int(r["anio"]), r["indicador"])
            if key not in existentes:
                db.add(CensusMetric(organization_id=None, anio=key[0], nivel=_NIVEL,
                                    territory_code=cfg.code, indicador=key[1], valor=float(r["valor"])))
                existentes.add(key)
    db.commit()


def seed_municipio_intel(db: Session) -> None:
    for cfg in MUNICIPIOS.values():
        seed_intel(db, cfg)
```

`backend/app/seeds/demo_election_date.py` (reemplazar completo):

```python
"""Seed idempotente: toda campaña con ``municipio_code`` del registro tiene un Contest con
``election_date = 2027-06-06`` y ``territory_id`` = área MUNICIPIO. Corre en cada arranque."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.campaign import Campaign, Contest
from app.models.catalog import Ambito, Cargo
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.seeds.municipios import MUNICIPIOS

_ELECTION_DATE = date(2027, 6, 6)
_CARGO = ("presidencia_municipal", "Presidencia Municipal", Ambito.MUNICIPAL, "municipio")


def _cargo(db: Session) -> Cargo:
    cargo = db.execute(select(Cargo).where(Cargo.key == _CARGO[0])).scalar_one_or_none()
    if cargo is None:
        cargo = Cargo(key=_CARGO[0], label=_CARGO[1], ambito=_CARGO[2], territory_level=_CARGO[3])
        db.add(cargo)
        db.flush()
    return cargo


def seed_election_date(db: Session) -> None:
    campaigns = db.execute(select(Campaign).where(
        Campaign.deleted_at.is_(None), Campaign.municipio_code.in_(list(MUNICIPIOS)))).scalars().all()
    if not campaigns:
        return
    cargo = _cargo(db)
    for c in campaigns:
        area = db.execute(select(ElectoralArea).where(
            ElectoralArea.code == c.municipio_code, ElectoralArea.level == AreaLevel.MUNICIPIO)).scalar_one_or_none()
        contest = db.execute(select(Contest).where(
            Contest.campaign_id == c.id, Contest.deleted_at.is_(None))).scalars().first()
        if contest is None:
            contest = Contest(organization_id=c.organization_id, campaign_id=c.id, cargo_id=cargo.id,
                              election_date=_ELECTION_DATE)
            db.add(contest)
        if contest.election_date is None:
            contest.election_date = _ELECTION_DATE
        if contest.territory_id is None and area is not None:
            contest.territory_id = area.id
    db.commit()
```

`backend/app/bootstrap.py` — en `_seed_demo_activists`, tras crear/obtener `campaign` (línea ~229) añadir:

```python
        if campaign.municipio_code is None:
            campaign.municipio_code = "15076"   # Lucy = San Mateo Atenco
            db.flush()
```

`backend/app/main.py:81-86` — reemplazar el bloque de territorio por:

```python
    if os.getenv("SEED_DEMO_TERRITORY", "").lower() == "true":
        from app.database import SessionLocal
        from app.seeds.demo_territory import seed_all_territories

        with SessionLocal() as db:
            seed_all_territories(db)
```

(y actualizar el comentario del seed de intel: "inteligencia municipal de todos los municipios del registro").

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_municipios_registry.py tests/test_seccion_electoral.py tests/test_municipio.py tests/test_dashboard_executive.py tests/test_demo_seed.py -q`
Expected: all passed. Si `test_dashboard_executive.py` dependía de `DEMO_CAMPAIGN_ID`, ajustar ese test para poner `municipio_code="15076"` en la campaña de prueba antes de llamar `seed_election_date`.

- [ ] **Step 5: Commit**

```bash
git add -A backend/app/seeds backend/app/bootstrap.py backend/app/main.py backend/tests/test_municipios_registry.py backend/tests/test_seccion_electoral.py backend/tests/test_municipio.py backend/tests/test_dashboard_executive.py
git commit -m "feat(seeds): registro de municipios y seeds parametrizados (territorio, intel, contest por campaña)"
```

---

## Task 5: Alcance de secciones por campaña (`secciones_query`) + folio por municipio

**Files:**
- Modify: `backend/app/services/territory_service.py` (añadir helper), `backend/app/services/operacion_service.py:49-54`, `backend/app/services/promovido_service.py:82-85,99-103`, `backend/app/services/militante_service.py:61-77,372-375`
- Test: `backend/tests/test_operacion.py` (append)

**Interfaces:**
- Produces: `territory_service.secciones_query(ctx: CampaignContext, anio: int = 2024) -> Select[SeccionElectoral]`; `territory_service.folio_prefix(ctx) -> str`.

- [ ] **Step 1: Write the failing tests (append to `tests/test_operacion.py`)**

```python
from dataclasses import replace

from app.models.seccion_electoral import SeccionElectoral
from app.services import territory_service
from app.services.operacion_service import list_planes


def _ensure_sec(db, code, muni_code):
    if db.execute(select(SeccionElectoral).where(
            SeccionElectoral.seccion == code, SeccionElectoral.anio == 2024)).scalar_one_or_none() is None:
        db.add(SeccionElectoral(seccion=code, municipio="X", municipio_code=muni_code, anio=2024,
                                lista_nominal=100, votos=50, participacion=50.0,
                                coalicion=30, morena=20, margen=10, prioridad="ALTA_PERSUADIBLE"))
        db.commit()


def test_secciones_query_sin_municipio_no_filtra(coordinador_ctx, db_session):
    _ensure_sec(db_session, "7771", "15076")
    _ensure_sec(db_session, "7772", "15013")
    codes = {s.seccion for s in db_session.execute(territory_service.secciones_query(coordinador_ctx)).scalars()}
    assert {"7771", "7772"} <= codes


def test_list_planes_aisla_por_municipio(coordinador_ctx, db_session):
    _ensure_sec(db_session, "7771", "15076")
    _ensure_sec(db_session, "7772", "15013")
    sma = replace(coordinador_ctx, municipio_code="15076")
    atz = replace(coordinador_ctx, municipio_code="15013")
    sma_codes = {p["seccion"] for p in list_planes(db_session, sma)}
    atz_codes = {p["seccion"] for p in list_planes(db_session, atz)}
    assert "7771" in sma_codes and "7772" not in sma_codes
    assert "7772" in atz_codes and "7771" not in atz_codes


def test_folio_prefix_por_municipio(coordinador_ctx):
    assert territory_service.folio_prefix(coordinador_ctx) == "SMA"
    assert territory_service.folio_prefix(replace(coordinador_ctx, municipio_code="15013")) == "ATZ"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_operacion.py -q -k "secciones_query or aisla or folio_prefix"`
Expected: FAIL `AttributeError: module 'app.services.territory_service' has no attribute 'secciones_query'`.

- [ ] **Step 3: Implement**

Append to `backend/app/services/territory_service.py`:

```python
from sqlalchemy import Select

from app.dependencies import CampaignContext
from app.models.seccion_electoral import SeccionElectoral
from app.seeds.municipios import config_de


def secciones_query(ctx: CampaignContext, anio: int = 2024) -> Select:
    """Secciones (matriz electoral) de la campaña. Sin ``municipio_code`` no se filtra
    (compatibilidad: campañas creadas antes de 0021 y fixtures)."""
    q = select(SeccionElectoral).where(SeccionElectoral.anio == anio)
    if ctx.municipio_code:
        q = q.where(SeccionElectoral.municipio_code == ctx.municipio_code)
    return q


def folio_prefix(ctx: CampaignContext) -> str:
    cfg = config_de(ctx.municipio_code)
    return cfg.folio_prefix if cfg else "SMA"
```

`operacion_service.py:49-54` — reemplazar la consulta de `list_planes`:

```python
    from app.services.territory_service import secciones_query  # local: evita import circular
    secciones = db.execute(secciones_query(ctx, _ANIO).order_by(SeccionElectoral.margen)).scalars().all()
```

`promovido_service.py:82-85`:

```python
    if prioridad:
        pr = secciones_query(ctx).with_only_columns(SeccionElectoral.seccion).where(
            SeccionElectoral.prioridad == prioridad)
        stmt = stmt.where(Registro.seccion.in_(pr))
```

y `:99-103`:

```python
        for f in db.execute(secciones_query(ctx).where(SeccionElectoral.seccion.in_(codes))).scalars():
            facts[f.seccion] = f
```

(con `from app.services.territory_service import secciones_query` arriba del módulo).

`militante_service.py:372-375` — misma sustitución que en promovidos; y `_next_folio`:

```python
    from app.services.territory_service import folio_prefix
    year = date.today().year
    prefix = f"{folio_prefix(ctx)}-{year}-"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_operacion.py tests/test_promovidos_api.py tests/test_militantes.py tests/test_militantes_api.py -q`
Expected: all passed (los folios existentes de tests siguen siendo `SMA-…` porque la campaña Alpha no tiene municipio).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/territory_service.py backend/app/services/operacion_service.py backend/app/services/promovido_service.py backend/app/services/militante_service.py backend/tests/test_operacion.py
git commit -m "feat(scope): secciones acotadas al municipio de la campaña + prefijo de folio por municipio"
```

---

## Task 6: Panorama por código + `bloques` + `GET /municipio/region`

**Files:**
- Modify: `backend/app/services/municipio_service.py`, `backend/app/routers/municipio.py`
- Create: `backend/app/schemas/municipio.py`, `backend/tests/test_municipio_region.py`
- Test: `backend/tests/test_municipio.py` (append)

**Interfaces:**
- Produces: `municipio_service.panorama(db, code)` con `"bloques": {"propio","rival"}`; `municipio_service.region(db, code) -> Optional[dict]` con `{"region": str, "municipios": [RegionMunicipio…]}`; `GET /municipio/region` (`CampaignCtx`); schemas `RegionMunicipio`, `RegionOut`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_municipio.py`:

```python
def test_panorama_incluye_bloques_y_busca_por_codigo():
    _seed_study()
    db = TestingSessionLocal()
    try:
        p = municipio_service.panorama(db, _MUNI)
    finally:
        db.close()
    assert p["bloques"] == {"propio": "Coalición", "rival": "Morena"}


def test_panorama_por_codigo_no_mezcla():
    _seed_study()
    db = TestingSessionLocal()
    try:
        db.add(SeccionElectoral(seccion="9993", municipio="Atizapán de Zaragoza", municipio_code="15013",
                                anio=2024, lista_nominal=10, votos=5, participacion=50.0,
                                coalicion=3, morena=2, margen=1, prioridad="ALTA_PERSUADIBLE"))
        db.commit()
        p = municipio_service.panorama(db, _MUNI)
        codes = {s["seccion"] for s in p["secciones"]}
        assert "9993" not in codes
        db.execute(delete(SeccionElectoral).where(SeccionElectoral.seccion == "9993"))
        db.commit()
    finally:
        db.close()
```

Create `tests/test_municipio_region.py`:

```python
"""GET /municipio/region — resumen comparativo de la región de la campaña activa."""
import pytest
from sqlalchemy import delete, select

from app.models.campaign import Campaign
from app.models.census import CensusMetric
from app.seeds.demo_municipio_intel import seed_intel
from app.seeds.municipios import MUNICIPIOS, municipios_de_region
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers

REGION_CODES = [m.code for m in municipios_de_region("atizapan")]


@pytest.fixture
def region_seeded():
    db = TestingSessionLocal()
    try:
        for code in REGION_CODES + ["15076"]:
            seed_intel(db, MUNICIPIOS[code])
        yield
        db.execute(delete(CensusMetric).where(CensusMetric.territory_code.in_(REGION_CODES + ["15076"])))
        camp = db.get(Campaign, ALPHA_CAMPAIGN_ID)
        camp.municipio_code = None
        db.commit()
    finally:
        db.close()


def _set_muni(code):
    db = TestingSessionLocal()
    try:
        db.get(Campaign, ALPHA_CAMPAIGN_ID).municipio_code = code
        db.commit()
    finally:
        db.close()


def test_region_atizapan_7_municipios_campana_primero(client, region_seeded):
    _set_muni("15013")
    r = client.get("/api/municipio/region", headers={**auth_headers(client, "coord@alpha.gov"),
                                                    "X-Campaign-Id": ALPHA_CAMPAIGN_ID})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["region"] == "Atizapán y periferia"
    assert len(body["municipios"]) == 7
    first = body["municipios"][0]
    assert first["code"] == "15013" and first["es_campana"] is True
    assert first["lista_nominal_2024"] == 422224
    assert first["secciones_total"] == 174 and first["poblacion"] == 523674
    # resto ordenado por lista nominal desc
    rest = [m["lista_nominal_2024"] for m in body["municipios"][1:]]
    assert rest == sorted(rest, reverse=True)


def test_region_sma_solo_sma(client, region_seeded):
    _set_muni("15076")
    r = client.get("/api/municipio/region", headers={**auth_headers(client, "coord@alpha.gov"),
                                                    "X-Campaign-Id": ALPHA_CAMPAIGN_ID})
    assert [m["code"] for m in r.json()["municipios"]] == ["15076"]


def test_region_errores(client, region_seeded):
    h = auth_headers(client, "coord@alpha.gov")
    assert client.get("/api/municipio/region", headers=h).status_code == 400
    _set_muni(None)
    assert client.get("/api/municipio/region", headers={**h, "X-Campaign-Id": ALPHA_CAMPAIGN_ID}).status_code == 404
    _set_muni("15013")
    assert client.get("/api/municipio/region", headers={**auth_headers(client, "activista1@alpha.gov"),
                                                       "X-Campaign-Id": ALPHA_CAMPAIGN_ID}).status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_municipio.py tests/test_municipio_region.py -q`
Expected: FAIL (`KeyError: 'bloques'`, 404 en `/municipio/region` porque cae en `/{code}/panorama`).

- [ ] **Step 3: Implement**

`app/schemas/municipio.py`:

```python
from typing import Optional

from pydantic import BaseModel


class RegionMunicipio(BaseModel):
    code: str
    name: str
    es_campana: bool
    lista_nominal_2024: Optional[int] = None
    participacion_2024: Optional[float] = None
    margen_votos_2024: Optional[int] = None
    margen_pp_2024: Optional[float] = None
    secciones_total: Optional[int] = None
    secciones_persuadibles: Optional[int] = None
    poblacion: Optional[int] = None


class RegionOut(BaseModel):
    region: str
    municipios: list[RegionMunicipio]
```

`app/services/municipio_service.py` — cambios:

```python
from app.seeds.municipios import REGIONES, config_de, municipios_de_region
# en panorama(): reemplazar la consulta de secciones por
    secciones = [{...} for s in db.execute(
        select(SeccionElectoral)
        .where(SeccionElectoral.municipio_code == code, SeccionElectoral.anio == _ANIO_ACTUAL)
        .order_by(SeccionElectoral.margen)
    ).scalars()]
# y el return:
    cfg = config_de(code)
    return {
        "municipio": {"code": code, "name": muni.name if muni else (cfg.name if cfg else code)},
        "bloques": {"propio": cfg.bloque_propio if cfg else "Coalición",
                    "rival": cfg.bloque_rival if cfg else "Morena"},
        ...  # resto igual
    }


def region(db: Session, code: str) -> Optional[dict]:
    cfg = config_de(code)
    if cfg is None:
        return None
    out = []
    for m in municipios_de_region(cfg.region):
        mx = _metrics(db, m.code)
        out.append({
            "code": m.code, "name": m.name, "es_campana": m.code == code,
            "lista_nominal_2024": _opt_int(mx.get((2024, "elec_lista_nominal"))),
            "participacion_2024": mx.get((2024, "elec_participacion")),
            "margen_votos_2024": _opt_int(mx.get((2024, "elec_margen_votos"))),
            "margen_pp_2024": mx.get((2024, "elec_margen_pp")),
            "secciones_total": _opt_int(mx.get((2024, "secciones_total"))),
            "secciones_persuadibles": _opt_int(mx.get((2024, "secciones_persuadibles"))),
            "poblacion": _opt_int(mx.get((2020, "poblacion"))),
        })
    out.sort(key=lambda x: (not x["es_campana"], -(x["lista_nominal_2024"] or 0)))
    return {"region": REGIONES[cfg.region], "municipios": out}
```

`app/routers/municipio.py` — **antes** de `/{code}/panorama` (orden de rutas importa):

```python
from app.dependencies import CampaignCtx
from app.schemas.municipio import RegionOut


@router.get("/region", response_model=RegionOut)
def region(db: DbSession, cctx: CampaignCtx):
    if not cctx.municipio_code:
        raise HTTPException(status_code=404, detail="Campaña sin municipio")
    data = municipio_service.region(db, cctx.municipio_code)
    if data is None:
        raise HTTPException(status_code=404, detail="Municipio fuera del registro")
    return data
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_municipio.py tests/test_municipio_region.py -q`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/municipio_service.py backend/app/routers/municipio.py backend/app/schemas/municipio.py backend/tests/test_municipio.py backend/tests/test_municipio_region.py
git commit -m "feat(municipio): panorama por código con etiquetas de bloque + GET /municipio/region"
```

---

## Task 7: Frontend — campaña con municipio/candidato, selector regional y panorama dinámico

**Files:**
- Modify: `frontend/src/store/campaignStore.ts:3-9`, `frontend/src/api/municipio.ts`, `frontend/src/modules/municipio/PanoramaMunicipioPage.tsx`, `frontend/src/modules/registry.ts:286`, `frontend/src/modules/militantes/CapturaMilitantePage.tsx:61`, `frontend/src/pages/DashboardPage.tsx:116-123`, `frontend/src/components/layout/CampaignSwitcher.tsx:57-61`
- Create: `frontend/src/modules/municipio/regionHelpers.ts`, `frontend/src/modules/municipio/__tests__/regionHelpers.test.ts`

**Interfaces:**
- Consumes: `GET /municipio/region` → `RegionOut`; `GET /municipio/{code}/panorama` con `bloques`.
- Produces: `Campaign { municipio_code?: string|null; candidato?: string|null; partido?: string|null }`; `getRegion(): Promise<RegionOut>`; `pickDefaultCode(region, campaignCode)`, `campaignSubtitle(c)`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/modules/municipio/__tests__/regionHelpers.test.ts
import { describe, expect, it } from "vitest";
import { campaignSubtitle, pickDefaultCode } from "../regionHelpers";

const region = {
  region: "Atizapán y periferia",
  municipios: [
    { code: "15013", name: "Atizapán", es_campana: true },
    { code: "15104", name: "Tlalnepantla", es_campana: false },
  ],
};

describe("pickDefaultCode", () => {
  it("prefers the campaign municipio", () => {
    expect(pickDefaultCode(region as never, "15013")).toBe("15013");
  });
  it("falls back to es_campana, then first", () => {
    expect(pickDefaultCode(region as never, null)).toBe("15013");
    expect(pickDefaultCode({ region: "x", municipios: [region.municipios[1]] } as never, null)).toBe("15104");
    expect(pickDefaultCode({ region: "x", municipios: [] }, null)).toBeNull();
  });
});

describe("campaignSubtitle", () => {
  it("formats candidato and partido", () => {
    expect(campaignSubtitle({ name: "Atizapán 2027", candidato: "Luis Montaño", partido: "Morena-PVEM-PT" } as never))
      .toBe("Atizapán 2027 · Luis Montaño (Morena-PVEM-PT)");
    expect(campaignSubtitle({ name: "Alpha", candidato: "X" } as never)).toBe("Alpha · X");
    expect(campaignSubtitle({ name: "Alpha" } as never)).toBeNull();
    expect(campaignSubtitle(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/modules/municipio`
Expected: FAIL (módulo `../regionHelpers` no existe).

- [ ] **Step 3: Implement**

`frontend/src/store/campaignStore.ts` — interfaz:

```ts
export interface Campaign {
  id: string;
  name: string;
  cycle: string;
  status: string;
  license_tier: string;
  municipio_code?: string | null;
  candidato?: string | null;
  partido?: string | null;
}
```

`frontend/src/modules/municipio/regionHelpers.ts`:

```ts
import type { Campaign } from "@/store/campaignStore";

export interface RegionMunicipio {
  code: string;
  name: string;
  es_campana: boolean;
  lista_nominal_2024?: number | null;
  participacion_2024?: number | null;
  margen_votos_2024?: number | null;
  margen_pp_2024?: number | null;
  secciones_total?: number | null;
  secciones_persuadibles?: number | null;
  poblacion?: number | null;
}

export interface RegionOut {
  region: string;
  municipios: RegionMunicipio[];
}

/** Municipio seleccionado por defecto: el de la campaña; si no, el marcado es_campana; si no, el primero. */
export function pickDefaultCode(region: RegionOut, campaignCode: string | null | undefined): string | null {
  if (campaignCode && region.municipios.some((m) => m.code === campaignCode)) return campaignCode;
  const flagged = region.municipios.find((m) => m.es_campana);
  return flagged?.code ?? region.municipios[0]?.code ?? null;
}

/** "Campaña · Candidato (Partido)" — null cuando la campaña no tiene candidato. */
export function campaignSubtitle(c: Campaign | undefined): string | null {
  if (!c?.candidato) return null;
  return c.partido ? `${c.name} · ${c.candidato} (${c.partido})` : `${c.name} · ${c.candidato}`;
}
```

`frontend/src/api/municipio.ts` — añadir `bloques` al panorama y `getRegion`:

```ts
import type { RegionOut } from "@/modules/municipio/regionHelpers";
export type { RegionMunicipio, RegionOut } from "@/modules/municipio/regionHelpers";

export interface MunicipioPanorama {
  municipio: { code: string; name: string };
  bloques: { propio: string; rival: string };
  // ...campos existentes sin cambio
}

export async function getRegion(): Promise<RegionOut> {
  return (await apiClient.get("/municipio/region")).data;
}
```

`PanoramaMunicipioPage.tsx` — cambios:

1. Eliminar `const CODE = "15076";`. Importar `useState`, `useMemo`, `useCampaignStore`, `getRegion`, `pickDefaultCode`.
2. Componente:

```tsx
export default function PanoramaMunicipioPage() {
  const activeId = useCampaignStore((s) => s.activeId);
  const campaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === s.activeId));
  const regionState = useAsync(() => (activeId ? getRegion() : Promise.reject(new Error("Selecciona una campaña"))), [activeId]);
  const [selected, setSelected] = useState<string | null>(null);
  const code = selected ?? (regionState.data ? pickDefaultCode(regionState.data, campaign?.municipio_code) : null);
  const state = useAsync(() => (code ? getMunicipioPanorama(code) : Promise.resolve(null)), [code]);
  const d = state.data;
  const nav = useNavigate();
  const esCampana = !!code && code === campaign?.municipio_code;
  const nombre = d?.municipio.name ?? "Panorama municipal";
  // ...
```

3. `AppLayout title={nombre}`; `PageHeader eyebrow="Inteligencia municipal · IEEM / INEGI" title={nombre}` y subtítulo genérico: `"Diagnóstico y lectura electoral 2018–2024 por sección."`.
4. Debajo del header, chips de región (solo si `regionState.data` y > 1 municipio):

```tsx
{regionState.data && regionState.data.municipios.length > 1 && (
  <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Municipio">
    {regionState.data.municipios.map((m) => (
      <button key={m.code} role="tab" aria-selected={m.code === code}
        onClick={() => setSelected(m.code)}
        className={`rounded-pill px-3 py-1 text-xs font-semibold focus-ring ${m.code === code ? "bg-accent/15 text-accent" : "bg-line/60 text-ink-muted hover:text-ink"}`}>
        {m.name}{m.es_campana ? " · campaña" : ""}
      </button>
    ))}
  </div>
)}
```

5. `DataState` envuelve `regionState` y `state`: sin campaña activa → `<DataState error={new Error("Esta campaña no tiene municipio asignado")} …/>` cuando `regionState.error` tenga status 404; el mensaje del backend se muestra tal cual.
6. Etiquetas de bloque: en `SeccionesTabla` recibir `bloques` y usar `{bloques.propio}` / `{bloques.rival}` en los `<th>`; en la tarjeta "Coalición ganadora" usar `context={d.bloques.rival}` cuando `coalicion_ganadora_votos` sea del rival (mantener el texto genérico `"bloque ganador"`); la nota al pie: `Margen = {d.bloques.propio} − {d.bloques.rival} por sección. Positivo = ventaja propia; negativo = ventaja rival.`; el `note` de "Geografía seccional": ``${num(d.secciones_resumen.coalicion)} ${d.bloques.propio} · ${num(d.secciones_resumen.morena)} ${d.bloques.rival}``.
7. Enlace/clic al plan territorial solo si `esCampana`: `onRowClick={esCampana ? () => nav("/plan-territorial") : () => {}}` y el botón "Ver Plan Territorial" se renderiza solo con `esCampana`.
8. Sección "Región" al final (solo si `regionState.data.municipios.length > 1`):

```tsx
<section>
  <SectionHeading eyebrow="Región" title={regionState.data.region} note="IEEM 2024 · Censo 2020" />
  <div className="mt-4 card-premium overflow-x-auto p-2">
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs uppercase tracking-wider text-ink-faint">
        <th className="px-3 py-2">Municipio</th><th className="px-3 py-2 text-right">Lista nominal</th>
        <th className="px-3 py-2 text-right">Participación</th><th className="px-3 py-2 text-right">Margen 2024</th>
        <th className="px-3 py-2 text-right">Secciones</th><th className="px-3 py-2 text-right">Persuadibles</th>
        <th className="px-3 py-2 text-right">Población</th></tr></thead>
      <tbody>
        {regionState.data.municipios.map((m) => (
          <tr key={m.code} className={`border-t border-line/70 ${m.es_campana ? "bg-accent/8 font-semibold" : ""}`}>
            <td className="px-3 py-2">{m.name}</td>
            <td className="px-3 py-2 text-right tabular-nums">{num(m.lista_nominal_2024)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{pct(m.participacion_2024)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{m.margen_votos_2024 != null ? `${m.margen_votos_2024 >= 0 ? "+" : ""}${nf.format(m.margen_votos_2024)}` : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums">{num(m.secciones_total)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{num(m.secciones_persuadibles)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{num(m.poblacion)}</td>
          </tr>))}
      </tbody>
    </table>
  </div>
</section>
```

9. Radiografía municipal: sustituir la tarjeta "Pobreza moderada" por `label="Pobreza moderada"` que muestra "—" cuando falta (ya lo hace `pct`), y el párrafo del calzado por uno neutro: `Grado promedio de escolaridad {num(d.socio.grado_escolaridad)} · {pct(d.socio.pct_sin_derechohabiencia)} sin derechohabiencia · {pct(d.socio.pct_viviendas_internet)} de viviendas con internet.` Quitar la tarjeta "Población 5–19" y poner `label="18 años y más" value={num(d.socio.pob_18_mas)}`. Los captions fijos de las gráficas ("874 en 2024", "MC … 4.4×") pasan a genéricos: `caption="votos de diferencia por elección"` y `caption="voto directo por partido"`.

`registry.ts:286`: `label: "Panorama municipal"`.

`CapturaMilitantePage.tsx:61`: `municipio: ""` en `EMPTY_FORM`, y al montar el formulario: `const campaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === s.activeId));` + `useEffect(() => { if (campaign?.municipio_code) getMunicipioPanorama(campaign.municipio_code).then((p) => setForm((f) => f.municipio ? f : { ...f, municipio: p.municipio.name })).catch(() => {}); }, [campaign?.municipio_code]);` (con `setForm` el setter existente del estado del formulario).

`DashboardPage.tsx:118-123`: `const campaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === s.activeId));` y `subtitle={campaignSubtitle(campaign) ?? "Avance de campaña en tiempo real: promoción, afiliación, atención ciudadana y cobertura territorial."}`.

`CampaignSwitcher.tsx:57-61`: `{c.name} · {c.cycle}{c.candidato ? ` — ${c.candidato}` : ""}`.

- [ ] **Step 4: Type-check and run tests**

Run: `cd frontend && npm run build && npm run test`
Expected: build OK; vitest all passed (incluye `regionHelpers.test.ts`, 4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): panorama por campaña con selector regional, etiquetas de bloque y candidato en cabecera"
```

---

## Task 8: Seed AZ-3 — org nueva, re-domicilio de Arturo, campaña y estructura

**Files:**
- Create: `backend/app/seeds/demo_atizapan.py`, `backend/tests/test_demo_atizapan.py`
- Modify: `backend/app/main.py` (lifespan, tras `seed_all_territories`)

**Interfaces:**
- Produces: `seed_atizapan_campaign(db) -> Optional[Campaign]` (None cuando el gate está apagado); `EMAIL_DOMAIN = "demo.atizapan.mx"`; `zonas(secciones: list[str], n: int = 8) -> list[list[str]]`; `SeedResult` no se expone (el seed loguea conteos).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_demo_atizapan.py
"""Seed AZ-3: org 'atizapan', re-domicilio del admin, campaña y estructura (51 usuarios)."""
import pytest
from sqlalchemy import func, select

from app.core.security import hash_password, verify_password
from app.models.campaign import Campaign, CampaignMembership, Contest
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.seeds.demo_atizapan import EMAIL_DOMAIN, seed_atizapan_campaign, zonas
from app.seeds.demo_territory import seed_territory
from app.seeds.municipios import MUNICIPIOS
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal

ORG = "atizapan-test"
ADMIN_EMAIL = "arturo.test@atlastech.mx"
PW = "AtizapanPwd9!"


def _env(monkeypatch, admin_email=ADMIN_EMAIL):
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN", "true")
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN_PASSWORD", PW)
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN_ORG_SLUG", ORG)
    if admin_email:
        monkeypatch.setenv("SEED_DEMO_ATIZAPAN_ADMIN_EMAIL", admin_email)
    else:
        monkeypatch.delenv("SEED_DEMO_ATIZAPAN_ADMIN_EMAIL", raising=False)


@pytest.fixture
def db():
    s = TestingSessionLocal()
    seed_territory(s, MUNICIPIOS["15013"])
    try:
        yield s
    finally:
        s.close()


def test_zonas_reparte_contiguo():
    z = zonas([str(i) for i in range(1, 175)], 8)
    assert len(z) == 8 and sum(len(x) for x in z) == 174
    assert z[0][0] == "1" and z[-1][-1] == "174"
    assert max(len(x) for x in z) - min(len(x) for x in z) <= 1


def test_gate_apagado_no_hace_nada(monkeypatch, db):
    monkeypatch.delenv("SEED_DEMO_ATIZAPAN", raising=False)
    assert seed_atizapan_campaign(db) is None
    assert db.execute(select(Organization).where(Organization.slug == ORG)).scalar_one_or_none() is None


def test_seed_crea_org_campana_y_estructura(monkeypatch, db):
    _env(monkeypatch, admin_email=None)
    camp = seed_atizapan_campaign(db)
    org = db.execute(select(Organization).where(Organization.slug == ORG)).scalar_one()
    assert camp.organization_id == org.id
    assert camp.municipio_code == "15013" and camp.candidato == "Luis Montaño" and camp.partido == "Morena-PVEM-PT"
    users = db.execute(select(User).where(User.organization_id == org.id)).scalars().all()
    roles = {r: sum(1 for u in users if u.role == r) for r in UserRole}
    assert roles[UserRole.COORDINADOR] == 1 and roles[UserRole.LIDER] == 8
    assert roles[UserRole.ACTIVISTA] == 40 and roles[UserRole.CAPTURISTA] == 2
    coord = next(u for u in users if u.role == UserRole.COORDINADOR)
    assert coord.email == f"coordinador@{EMAIL_DOMAIN}" and coord.area is not None and coord.area.code == "15013"
    lideres = [u for u in users if u.role == UserRole.LIDER]
    assert all(l.coordinador_id == coord.id for l in lideres)
    activistas = [u for u in users if u.role == UserRole.ACTIVISTA]
    assert all(a.lider_id in {l.id for l in lideres} and a.seccion for a in activistas)
    assert len({a.seccion for a in activistas}) == 40
    n_mem = db.execute(select(func.count()).select_from(CampaignMembership).where(
        CampaignMembership.campaign_id == camp.id)).scalar_one()
    assert n_mem == 51
    contest = db.execute(select(Contest).where(Contest.campaign_id == camp.id)).scalar_one()
    assert str(contest.election_date) == "2027-06-06" and contest.territory_id is not None
    assert verify_password(PW, coord.hashed_password)


def test_seed_idempotente(monkeypatch, db):
    _env(monkeypatch, admin_email=None)
    seed_atizapan_campaign(db)
    seed_atizapan_campaign(db)
    org = db.execute(select(Organization).where(Organization.slug == ORG)).scalar_one()
    n = db.execute(select(func.count()).select_from(User).where(User.organization_id == org.id)).scalar_one()
    assert n == 51
    assert db.execute(select(func.count()).select_from(Campaign).where(
        Campaign.organization_id == org.id)).scalar_one() == 1


def test_rehome_superadmin_de_otra_org(monkeypatch, db):
    alpha = db.execute(select(Organization).where(Organization.slug == "alpha")).scalar_one()
    u = User(email=ADMIN_EMAIL, full_name="Arturo Test", role=UserRole.SUPERADMIN,
             organization_id=alpha.id, hashed_password=hash_password("Otra9!"))
    db.add(u); db.flush()
    db.add(CampaignMembership(user_id=u.id, campaign_id=ALPHA_CAMPAIGN_ID, role=UserRole.ADMIN)); db.commit()
    _env(monkeypatch)
    camp = seed_atizapan_campaign(db)
    db.refresh(u)
    org = db.execute(select(Organization).where(Organization.slug == ORG)).scalar_one()
    assert u.organization_id == org.id and u.role == UserRole.ADMIN
    assert verify_password("Otra9!", u.hashed_password)  # conserva contraseña
    ajenas = db.execute(select(CampaignMembership).where(
        CampaignMembership.user_id == u.id, CampaignMembership.campaign_id == ALPHA_CAMPAIGN_ID)).scalars().all()
    assert ajenas == []
    propia = db.execute(select(CampaignMembership).where(
        CampaignMembership.user_id == u.id, CampaignMembership.campaign_id == camp.id)).scalar_one()
    assert propia.role == UserRole.ADMIN


def test_rehome_ya_en_org_no_cambia_y_usuario_inexistente_se_crea(monkeypatch, db):
    _env(monkeypatch, admin_email="nuevo.admin@atlastech.mx")
    seed_atizapan_campaign(db)
    nuevo = db.execute(select(User).where(User.email == "nuevo.admin@atlastech.mx")).scalar_one()
    assert nuevo.role == UserRole.ADMIN and nuevo.must_change_password is True
    before = (nuevo.organization_id, nuevo.hashed_password)
    seed_atizapan_campaign(db)
    db.refresh(nuevo)
    assert (nuevo.organization_id, nuevo.hashed_password) == before
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_demo_atizapan.py -q`
Expected: ImportError `app.seeds.demo_atizapan`.

- [ ] **Step 3: Implement**

```python
# backend/app/seeds/demo_atizapan.py
"""Seed AZ-3 (idempotente, gateado): organización 'Atizapán 2027', re-domicilio del admin
demo (Arturo), campaña 'Atizapán de Zaragoza 2027 · Luis Montaño' y estructura
(1 coordinador, 8 líderes por zona, 40 activistas por sección, 2 capturistas).

Env:
  SEED_DEMO_ATIZAPAN=true            gate
  SEED_DEMO_ATIZAPAN_PASSWORD        contraseña común (obligatoria; sin ella → skip)
  SEED_DEMO_ATIZAPAN_ORG_SLUG        default 'atizapan'
  SEED_DEMO_ATIZAPAN_ADMIN_EMAIL     opcional: usuario a re-domiciliar como ADMIN de la org
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.campaign import Campaign, CampaignMembership, CampaignStatus
from app.models.electoral_area import AreaLevel, ElectoralArea
from app.models.organization import Organization
from app.models.seccion_electoral import SeccionElectoral
from app.models.user import User, UserRole
from app.seeds.demo_election_date import seed_election_date
from app.services.audit_service import record_audit

logger = logging.getLogger(__name__)

MUNI_CODE = "15013"
CAMPAIGN_NAME = "Atizapán de Zaragoza 2027"
CANDIDATO = "Luis Montaño"
PARTIDO = "Morena-PVEM-PT"
EMAIL_DOMAIN = "demo.atizapan.mx"
N_LIDERES, ACTIVISTAS_POR_LIDER, N_CAPTURISTAS = 8, 5, 2
_PRIORIDAD_ORDEN = {"ALTA_PERSUADIBLE": 0, "COMPETITIVA": 1, "RECUPERAR_OPOSICION": 2, "DEFENDER_EXPANDIR": 3}

_NOMBRES = ["Ana", "Luis", "María", "José", "Carmen", "Jorge", "Patricia", "Miguel", "Laura", "Ricardo",
            "Gabriela", "Fernando", "Adriana", "Héctor", "Verónica", "Raúl", "Claudia", "Sergio",
            "Alejandra", "Arturo", "Rocío", "Daniel", "Norma", "Óscar", "Leticia", "Javier", "Mónica",
            "Enrique", "Beatriz", "Rodrigo", "Guadalupe", "Francisco", "Silvia", "Andrés", "Elena",
            "Manuel", "Teresa", "Pablo", "Lorena", "Víctor", "Diana", "Roberto", "Karla", "Alberto",
            "Susana", "Ernesto", "Paola", "Gerardo", "Marisol", "Iván", "Cecilia"]
_APELLIDOS = ["García", "Hernández", "Martínez", "López", "González", "Pérez", "Rodríguez", "Sánchez",
              "Ramírez", "Cruz", "Flores", "Gómez", "Morales", "Vázquez", "Reyes", "Jiménez", "Torres",
              "Díaz", "Gutiérrez", "Ruiz", "Mendoza", "Aguilar", "Ortiz", "Castillo", "Romero",
              "Álvarez", "Chávez", "Rivera", "Juárez", "Medina", "Vargas", "Castro", "Ramos", "Guzmán",
              "Salazar", "Rojas", "Herrera", "Domínguez", "Luna", "Ibarra"]


def _nombre(i: int) -> str:
    return f"{_NOMBRES[i % len(_NOMBRES)]} {_APELLIDOS[i % len(_APELLIDOS)]} {_APELLIDOS[(i * 7 + 3) % len(_APELLIDOS)]}"


def zonas(secciones: list[str], n: int = N_LIDERES) -> list[list[str]]:
    """n bloques contiguos (por orden numérico) con tamaños que difieren a lo más en 1."""
    ordenadas = sorted(secciones, key=int)
    base, extra = divmod(len(ordenadas), n)
    out, i = [], 0
    for k in range(n):
        size = base + (1 if k < extra else 0)
        out.append(ordenadas[i:i + size])
        i += size
    return out


def _user(db: Session, email: str, **kw) -> tuple[User, bool]:
    u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if u is not None:
        return u, False
    u = User(email=email, is_active=True, must_change_password=False, **kw)
    db.add(u)
    db.flush()
    return u, True


def _membership(db: Session, user: User, campaign: Campaign, role: UserRole) -> None:
    if db.execute(select(CampaignMembership).where(
            CampaignMembership.user_id == user.id, CampaignMembership.campaign_id == campaign.id)).scalar_one_or_none() is None:
        db.add(CampaignMembership(user_id=user.id, campaign_id=campaign.id, role=role))


def _rehome_admin(db: Session, org: Organization, campaign: Campaign, email: str, password_hash: str) -> None:
    u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if u is None:
        u = User(email=email, full_name="Administrador Atizapán 2027", role=UserRole.ADMIN,
                 organization_id=org.id, hashed_password=password_hash, is_active=True,
                 must_change_password=True)
        db.add(u)
        db.flush()
        logger.info("Seeded admin %s in org %s", email, org.slug)
    elif u.organization_id != org.id:
        prev_org, prev_role = u.organization_id, u.role
        u.organization_id = org.id
        u.role = UserRole.ADMIN
        u.lider_id = None
        u.coordinador_id = None
        u.area_id = None
        ajenas = select(CampaignMembership.id).join(Campaign, Campaign.id == CampaignMembership.campaign_id).where(
            CampaignMembership.user_id == u.id, Campaign.organization_id != org.id)
        db.execute(delete(CampaignMembership).where(CampaignMembership.id.in_(ajenas)))
        record_audit(db, action="user.rehome", actor_id=None, organization_id=org.id,
                     entity_type="user", entity_id=u.id,
                     meta={"from_org": prev_org, "from_role": prev_role.value, "to_role": "admin"})
        logger.warning("Re-homed %s → org %s as ADMIN", email, org.slug)
    _membership(db, u, campaign, UserRole.ADMIN)


def seed_atizapan_campaign(db: Session) -> Optional[Campaign]:
    if os.getenv("SEED_DEMO_ATIZAPAN", "").lower() != "true":
        return None
    password = os.getenv("SEED_DEMO_ATIZAPAN_PASSWORD")
    if not password:
        logger.info("SEED_DEMO_ATIZAPAN_PASSWORD not set — skipping Atizapán seed")
        return None
    slug = os.getenv("SEED_DEMO_ATIZAPAN_ORG_SLUG", "atizapan")
    pw_hash = hash_password(password)

    org = db.execute(select(Organization).where(Organization.slug == slug)).scalar_one_or_none()
    if org is None:
        org = Organization(name="Atizapán 2027", slug=slug)
        db.add(org)
        db.flush()

    campaign = db.execute(select(Campaign).where(
        Campaign.organization_id == org.id, Campaign.name == CAMPAIGN_NAME)).scalar_one_or_none()
    if campaign is None:
        campaign = Campaign(name=CAMPAIGN_NAME, cycle=2027, status=CampaignStatus.ACTIVE,
                            organization_id=org.id, municipio_code=MUNI_CODE, candidato=CANDIDATO,
                            partido=PARTIDO, meta_afiliacion=8000)
        db.add(campaign)
        db.flush()

    muni = db.execute(select(ElectoralArea).where(
        ElectoralArea.code == MUNI_CODE, ElectoralArea.level == AreaLevel.MUNICIPIO)).scalar_one_or_none()
    facts = db.execute(select(SeccionElectoral).where(
        SeccionElectoral.municipio_code == MUNI_CODE, SeccionElectoral.anio == 2024)).scalars().all()
    if muni is None or not facts:
        logger.warning("Atizapán territory not seeded (SEED_DEMO_TERRITORY?) — skipping users")
        db.commit()
        return campaign
    prioridad = {f.seccion: f.prioridad for f in facts}

    coord, _ = _user(db, f"coordinador@{EMAIL_DOMAIN}", full_name=f"{_nombre(0)} — Coordinación de campaña",
                     role=UserRole.COORDINADOR, organization_id=org.id, hashed_password=pw_hash)
    if coord.area_id != muni.id:
        coord.area_id = muni.id
    _membership(db, coord, campaign, UserRole.COORDINADOR)

    idx = 1
    for z, bloque in enumerate(zonas(list(prioridad)), start=1):
        lider, _ = _user(db, f"lider{z:02d}@{EMAIL_DOMAIN}", full_name=f"{_nombre(idx)} — Líder zona {z}",
                         role=UserRole.LIDER, organization_id=org.id, coordinador_id=coord.id,
                         hashed_password=pw_hash)
        if lider.coordinador_id != coord.id:
            lider.coordinador_id = coord.id
        _membership(db, lider, campaign, UserRole.LIDER)
        idx += 1
        elegidas = sorted(bloque, key=lambda s: (_PRIORIDAD_ORDEN.get(prioridad[s], 9), int(s)))[:ACTIVISTAS_POR_LIDER]
        for k, sec in enumerate(elegidas, start=1):
            n = (z - 1) * ACTIVISTAS_POR_LIDER + k
            act, _ = _user(db, f"activista{n:02d}@{EMAIL_DOMAIN}", full_name=f"{_nombre(idx)} — Activista sección {sec}",
                           role=UserRole.ACTIVISTA, organization_id=org.id, lider_id=lider.id,
                           seccion=sec, hashed_password=pw_hash)
            if act.lider_id != lider.id:
                act.lider_id = lider.id
            _membership(db, act, campaign, UserRole.ACTIVISTA)
            idx += 1
    for c in range(1, N_CAPTURISTAS + 1):
        cap, _ = _user(db, f"capturista{c:02d}@{EMAIL_DOMAIN}", full_name=f"{_nombre(idx)} — Capturista",
                       role=UserRole.CAPTURISTA, organization_id=org.id, hashed_password=pw_hash)
        _membership(db, cap, campaign, UserRole.CAPTURISTA)
        idx += 1

    admin_email = os.getenv("SEED_DEMO_ATIZAPAN_ADMIN_EMAIL")
    if admin_email:
        _rehome_admin(db, org, campaign, admin_email.strip().lower(), pw_hash)

    db.commit()
    seed_election_date(db)  # contest 2027-06-06 + territory_id (idempotente)
    logger.info("Atizapán seed OK: org=%s campaign=%s", slug, campaign.id)
    return campaign
```

`backend/app/main.py` — tras el bloque de intel y antes del de election date:

```python
    try:
        from app.database import SessionLocal
        from app.seeds.demo_atizapan import seed_atizapan_campaign

        with SessionLocal() as db:
            seed_atizapan_campaign(db)
    except Exception:
        logger.exception("Atizapán demo seed failed during startup")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_demo_atizapan.py tests/test_auth.py tests/test_organizations.py -q`
Expected: all passed. (Los tests de tenancy cuentan usuarios de `alpha`/`beta`; el seed usa la org `atizapan-test`, y el test de re-domicilio crea el usuario en `alpha` pero lo mueve; si `test_organizations.py` cuenta usuarios de alpha por total exacto, reordenar ese fixture a `db.delete(u)` en teardown del test de re-domicilio.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/seeds/demo_atizapan.py backend/app/main.py backend/tests/test_demo_atizapan.py
git commit -m "feat(seed): org Atizapán 2027, re-domicilio del admin demo, campaña Luis Montaño y estructura de 51 usuarios"
```

---

## Task 9: Seed AZ-4 (parte 1) — promovidos y militantes sintéticos

**Files:**
- Create: `backend/app/seeds/demo_atizapan_operacion.py`, `backend/tests/test_demo_atizapan_operacion.py`

**Interfaces:**
- Produces: `MARCADOR = "demo-seed"`; `distribuir(total: int, pesos: dict[str, float]) -> dict[str, int]` (mayor resto); `clave_ficticia(rng, apellidos, nacimiento, sexo, n) -> str` (18 chars, `<6 letras><YYMMDD>15<H|M><NNN>`); `generar_registros(db, campaign, rng, hoy) -> list[Registro]`; `generar_militantes(db, campaign, registros, rng) -> list[Militante]`; `ya_sembrado(db, campaign) -> bool`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_demo_atizapan_operacion.py
"""Seed AZ-4: operación sintética de Atizapán (determinista, una sola vez, aislada)."""
import random
from collections import Counter
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.core import crypto
from app.models.militante import Militante
from app.models.registro import Registro
from app.models.user import User, UserRole
from app.seeds import demo_atizapan_operacion as op
from app.seeds.demo_atizapan import seed_atizapan_campaign
from app.seeds.demo_territory import seed_territory
from app.seeds.municipios import MUNICIPIOS
from tests.conftest import TestingSessionLocal

ORG = "atizapan-op-test"


@pytest.fixture
def campaign(monkeypatch):
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN", "true")
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN_PASSWORD", "Pwd9!Pwd9!")
    monkeypatch.setenv("SEED_DEMO_ATIZAPAN_ORG_SLUG", ORG)
    monkeypatch.delenv("SEED_DEMO_ATIZAPAN_ADMIN_EMAIL", raising=False)
    db = TestingSessionLocal()
    seed_territory(db, MUNICIPIOS["15013"])
    camp = seed_atizapan_campaign(db)
    try:
        yield db, camp
    finally:
        db.rollback()
        for model in (Militante, Registro):
            db.execute(model.__table__.delete().where(model.campaign_id == camp.id))
        db.commit()
        db.close()


def test_distribuir_mayor_resto_suma_exacta():
    d = op.distribuir(10, {"a": 1.0, "b": 1.0, "c": 1.0})
    assert sum(d.values()) == 10 and max(d.values()) - min(d.values()) <= 1


def test_clave_ficticia_formato():
    c = op.clave_ficticia(random.Random(1), "GARCIA HERNANDEZ", date(1985, 3, 9), "H", 7)
    assert len(c) == 18 and c[6:12] == "850309" and c[12:14] == "15" and c[14] == "H" and c[15:] == "007"


def test_generar_registros_volumen_distribucion_y_caida(campaign):
    db, camp = campaign
    hoy = date(2026, 9, 30)
    regs = op.generar_registros(db, camp, random.Random(15013), hoy)
    db.commit()
    assert len(regs) == op.N_PROMOVIDOS
    assert all(r.promotor == op.MARCADOR and r.campaign_id == camp.id and r.organization_id == camp.organization_id for r in regs)
    assert all(r.clave_elector_enc and r.clave_masked and r.clave_masked.startswith("****-") for r in regs)
    claves = {crypto.decrypt_clave(r.clave_elector_enc) for r in regs}
    assert len(claves) == len(regs)  # sin repetidas
    activistas = {u.id for u in db.execute(select(User).where(User.role == UserRole.ACTIVISTA,
                                                              User.organization_id == camp.organization_id)).scalars()}
    assert {r.activista_id for r in regs} <= activistas
    # última semana ISO completa: las zonas 3 y 7 no capturan
    inicio_actual = hoy - timedelta(days=hoy.weekday())
    ult_ini, ult_fin = inicio_actual - timedelta(days=7), inicio_actual
    silenciosas = op.activistas_de_zonas(db, camp, op.ZONAS_SILENCIOSAS)
    en_ventana = [r for r in regs if ult_ini <= r.created_at.date() < ult_fin]
    assert en_ventana and not any(r.activista_id in silenciosas for r in en_ventana)
    # densidad: persuadibles pesan más que defender
    por_sec = Counter(r.seccion for r in regs)
    assert len(por_sec) >= 160  # casi todas las 174 secciones reciben captura


def test_generar_militantes_20pct_folios_unicos(campaign):
    db, camp = campaign
    regs = op.generar_registros(db, camp, random.Random(15013), date(2026, 9, 30))
    db.commit()
    mils = op.generar_militantes(db, camp, regs, random.Random(7))
    db.commit()
    assert len(mils) == op.N_MILITANTES
    folios = [m.folio for m in mils]
    assert len(set(folios)) == len(folios) and all(f.startswith("ATZ-") for f in folios)
    assert Counter(m.estado for m in mils)["VALIDADO"] > len(mils) * 0.6
    assert all(m.curp_enc and m.consentimiento and m.manifestacion_voluntad for m in mils)


def test_ya_sembrado_marcador(campaign):
    db, camp = campaign
    assert op.ya_sembrado(db, camp) is False
    op.generar_registros(db, camp, random.Random(1), date(2026, 9, 30)); db.commit()
    assert op.ya_sembrado(db, camp) is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_demo_atizapan_operacion.py -q`
Expected: ImportError.

- [ ] **Step 3: Implement (part 1)**

```python
# backend/app/seeds/demo_atizapan_operacion.py
"""Seed AZ-4 (gateado, una sola vez): operación sintética para la campaña de Atizapán.
Determinista (random.Random(15013)); personas y claves FICTICIAS; marcador
``Registro.promotor == "demo-seed"``. Nunca loguea claves."""
from __future__ import annotations

import logging
import os
import random
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import crypto
from app.dependencies import CampaignContext
from app.models.campaign import Campaign
from app.models.militante import Militante
from app.models.registro import Registro
from app.models.seccion_electoral import SeccionElectoral
from app.models.user import User, UserRole
from app.seeds.demo_atizapan import _APELLIDOS, _NOMBRES, EMAIL_DOMAIN, zonas
from app.services import militante_service, privacy_service

logger = logging.getLogger(__name__)

MARCADOR = "demo-seed"
N_PROMOVIDOS = 6000
N_MILITANTES = 1200
SEMANAS = 12
ZONAS_SILENCIOSAS = (3, 7)          # sin capturas en la última semana ISO completa (O2/O4)
_PESO = {"ALTA_PERSUADIBLE": 1.6, "COMPETITIVA": 1.6, "RECUPERAR_OPOSICION": 1.0, "DEFENDER_EXPANDIR": 0.6}
COLONIAS = ["Lomas de Atizapán", "Las Alamedas", "Ciudad Adolfo López Mateos Centro", "Lomas de San Miguel",
            "Rancho San Juan", "El Potrero", "Villas de la Hacienda", "Las Colonias", "Lomas Lindas",
            "Ex-Hacienda El Pedregal", "Bosques de Ixtacala", "Calacoaya", "Lomas de Bellavista",
            "México Nuevo", "Hogares de Atizapán", "Jardines de Atizapán", "Las Peñitas", "Los Olivos",
            "San Juan Bosco", "Lázaro Cárdenas", "Ampliación Emiliano Zapata", "Prados Ixtacala",
            "Lomas de Monte María", "Villa de las Palmas", "El Cerrito", "Ampliación Peñitas",
            "Lomas de Guadalupe", "Margarita Maza de Juárez", "Zona Esmeralda", "La Condesa"]


def _ctx(db: Session, campaign: Campaign, user: User) -> CampaignContext:
    return CampaignContext(user=user, organization_id=campaign.organization_id, role=user.role,
                           campaign_id=campaign.id, municipio_code=campaign.municipio_code)


def distribuir(total: int, pesos: dict[str, float]) -> dict[str, int]:
    suma = sum(pesos.values()) or 1.0
    exact = {k: total * v / suma for k, v in pesos.items()}
    out = {k: int(v) for k, v in exact.items()}
    faltan = total - sum(out.values())
    for k in sorted(exact, key=lambda k: exact[k] - out[k], reverse=True)[:faltan]:
        out[k] += 1
    return out


def clave_ficticia(rng: random.Random, apellidos: str, nacimiento: date, sexo: str, n: int) -> str:
    letras = "".join(ch for ch in apellidos.upper() if ch.isalpha())[:6].ljust(6, "X")
    return f"{letras}{nacimiento:%y%m%d}15{sexo}{n % 1000:03d}"


def ya_sembrado(db: Session, campaign: Campaign) -> bool:
    return db.execute(select(Registro.id).where(
        Registro.campaign_id == campaign.id, Registro.promotor == MARCADOR).limit(1)).first() is not None


def _estructura(db: Session, campaign: Campaign) -> tuple[list[User], dict[str, list[User]]]:
    """(líderes ordenados por zona, {sección: [activistas de la zona]})."""
    users = db.execute(select(User).where(User.organization_id == campaign.organization_id,
                                          User.email.like(f"%@{EMAIL_DOMAIN}"))).scalars().all()
    lideres = sorted([u for u in users if u.role == UserRole.LIDER], key=lambda u: u.email)
    act_por_lider = {l.id: sorted([u for u in users if u.role == UserRole.ACTIVISTA and u.lider_id == l.id],
                                  key=lambda u: u.email) for l in lideres}
    secciones = [f.seccion for f in db.execute(select(SeccionElectoral).where(
        SeccionElectoral.municipio_code == campaign.municipio_code, SeccionElectoral.anio == 2024)).scalars()]
    por_seccion: dict[str, list[User]] = {}
    for lider, bloque in zip(lideres, zonas(secciones, len(lideres))):
        for s in bloque:
            por_seccion[s] = act_por_lider[lider.id]
    return lideres, por_seccion


def activistas_de_zonas(db: Session, campaign: Campaign, zonas_idx: tuple[int, ...]) -> set[str]:
    lideres, _ = _estructura(db, campaign)
    ids = set()
    for z in zonas_idx:
        lider = lideres[z - 1]
        ids.update(u.id for u in db.execute(select(User).where(User.lider_id == lider.id)).scalars())
    return ids


def generar_registros(db: Session, campaign: Campaign, rng: random.Random, hoy: date) -> list[Registro]:
    notice = privacy_service.get_active_notice(db, _ctx(db, campaign, db.execute(
        select(User).where(User.email == f"coordinador@{EMAIL_DOMAIN}")).scalar_one()))
    facts = db.execute(select(SeccionElectoral).where(
        SeccionElectoral.municipio_code == campaign.municipio_code, SeccionElectoral.anio == 2024)).scalars().all()
    lideres, act_por_seccion = _estructura(db, campaign)
    silenciosos = activistas_de_zonas(db, campaign, ZONAS_SILENCIOSAS)
    cupos = distribuir(N_PROMOVIDOS, {f.seccion: (f.lista_nominal or 1) * _PESO.get(f.prioridad or "", 1.0) for f in facts})
    inicio_actual = hoy - timedelta(days=hoy.weekday())
    ult_ini = inicio_actual - timedelta(days=7)
    inicio = hoy - timedelta(weeks=SEMANAS)

    out: list[Registro] = []
    n = 0
    for f in facts:
        acts = act_por_seccion.get(f.seccion) or []
        for i in range(cupos.get(f.seccion, 0)):
            n += 1
            sexo = rng.choice("HM")            # H/M: convención INE para la clave
            sexo_db = "M" if sexo == "H" else "F"  # M/F: convención del modelo Registro
            nombre = f"{rng.choice(_NOMBRES)} {rng.choice(_APELLIDOS)} {rng.choice(_APELLIDOS)}"
            apellidos = " ".join(nombre.split()[1:])
            edad = rng.randint(18, 85)
            nac = date(hoy.year - edad, rng.randint(1, 12), rng.randint(1, 28))
            act = acts[n % len(acts)] if acts else None
            dia = inicio + timedelta(days=rng.randint(0, SEMANAS * 7 - 1))
            if act is not None and act.id in silenciosos and dia >= ult_ini:
                dia -= timedelta(days=14)
            creado = datetime.combine(dia, time(rng.randint(8, 20), rng.randint(0, 59)), tzinfo=timezone.utc)
            clave = clave_ficticia(rng, apellidos, nac, sexo, n)
            out.append(Registro(
                organization_id=campaign.organization_id, campaign_id=campaign.id,
                activista_id=act.id if act else None, nombre_completo=nombre, seccion=f.seccion,
                direccion=f"Calle {rng.randint(1, 60)} No. {rng.randint(1, 250)}", colonia=rng.choice(COLONIAS),
                telefono=f"55{rng.randint(10000000, 99999999)}", sexo=sexo_db, edad=edad, promotor=MARCADOR,
                clave_elector_enc=crypto.encrypt_clave(clave), clave_masked=crypto.mask_clave(clave),
                consentimiento=True, consentimiento_at=creado, aviso_version=notice.version,
                created_at=creado, created_by=act.id if act else None))
    db.add_all(out)
    db.flush()
    return out
```

```python
def generar_militantes(db: Session, campaign: Campaign, registros: list[Registro], rng: random.Random) -> list[Militante]:
    coord = db.execute(select(User).where(User.email == f"coordinador@{EMAIL_DOMAIN}")).scalar_one()
    ctx = _ctx(db, campaign, coord)
    notice = privacy_service.get_active_notice(db, ctx)
    primero = militante_service._next_folio(db, ctx)
    prefix, base = primero.rsplit("-", 1)
    out: list[Militante] = []
    paso = max(1, len(registros) // N_MILITANTES)
    for k, r in enumerate(registros[::paso][:N_MILITANTES]):
        u = rng.random()
        estado = "VALIDADO" if u < 0.70 else "REGISTRADO" if u < 0.95 else "OBSERVADO"
        curp = f"{r.nombre_completo[:4].upper():X<4}{r.created_at:%y%m%d}{'H' if r.sexo == 'M' else 'M'}MC{k % 100:02d}AB{k % 10}"
        out.append(Militante(
            organization_id=campaign.organization_id, campaign_id=campaign.id, activista_id=r.activista_id,
            nombre_completo=r.nombre_completo, sexo=r.sexo, seccion=r.seccion, telefono=r.telefono,
            colonia=r.colonia, municipio="Atizapán de Zaragoza", estado_domicilio="México",
            folio=f"{prefix}-{int(base) + k:05d}", fecha_afiliacion=r.created_at.date(),
            curp_enc=crypto.encrypt_clave(curp), curp_masked=f"****{curp[-4:]}",
            clave_elector_enc=r.clave_elector_enc, clave_masked=r.clave_masked, estado=estado,
            validado_por=coord.id if estado == "VALIDADO" else None,
            validado_at=r.created_at if estado == "VALIDADO" else None,
            consentimiento=True, consentimiento_at=r.created_at, aviso_version=notice.version,
            manifestacion_voluntad=True, promotor=MARCADOR, created_at=r.created_at, created_by=r.activista_id))
    db.add_all(out)
    db.flush()
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_demo_atizapan_operacion.py -q`
Expected: 5 passed. (Si `Registro.sexo`/`Militante.folio` chocan con constraints, revisar `uq_militantes_campaign_folio` — los folios son consecutivos desde `_next_folio`, sin colisión.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/seeds/demo_atizapan_operacion.py backend/tests/test_demo_atizapan_operacion.py
git commit -m "feat(seed): promovidos y militantes sintéticos de Atizapán (deterministas, cifrados, con marcador)"
```

---

## Task 10: Seed AZ-4 (parte 2) — casos, minutas/acuerdos, agenda, planes, orquestador, CLI y lifespan

**Files:**
- Modify: `backend/app/seeds/demo_atizapan_operacion.py`, `backend/app/main.py`, `backend/tests/test_demo_atizapan_operacion.py`
- Create: `backend/scripts/seed_atizapan_operacion.py`

**Interfaces:**
- Produces: `generar_casos(db, campaign, rng, hoy) -> list[Caso]` (60); `generar_minutas(db, campaign, rng, hoy) -> tuple[list[Minuta], list[Acuerdo]]` (12/40); `generar_agenda(db, campaign, rng) -> list[AgendaItem]` (30); `generar_planes(db, campaign) -> list[SeccionPlan]` (174); `seed_atizapan_operacion(db, hoy: Optional[date] = None) -> bool` (True si sembró); `reset_operacion(db, campaign) -> dict[str,int]`.

- [ ] **Step 1: Write the failing tests (append)**

```python
from app.models.atencion import Caso, CasoEvento
from app.models.minuta import Acuerdo, Minuta
from app.models.operacion import AgendaItem, SeccionPlan


def test_casos_sla_vencidos_y_estados(campaign):
    db, camp = campaign
    hoy = date(2026, 9, 30)
    casos = op.generar_casos(db, camp, random.Random(3), hoy)
    db.commit()
    assert len(casos) == op.N_CASOS
    vencidos = [c for c in casos if c.fecha_compromiso and c.fecha_compromiso < hoy and c.estado not in ("ATENDIDO", "CERRADO")]
    assert len(vencidos) >= op.N_CASOS * 0.35
    assert len({c.folio for c in casos}) == len(casos)
    assert all(c.tipo in ("PETICION", "QUEJA", "APOYO", "OTRO") and c.seccion and c.asignado_a for c in casos)
    n_ev = db.execute(select(func.count()).select_from(CasoEvento).where(
        CasoEvento.caso_id.in_([c.id for c in casos]))).scalar_one()
    assert n_ev == len(casos)


def test_minutas_acuerdos_vencidos(campaign):
    db, camp = campaign
    hoy = date(2026, 9, 30)
    minutas, acuerdos = op.generar_minutas(db, camp, random.Random(5), hoy)
    db.commit()
    assert len(minutas) == op.N_MINUTAS and len(acuerdos) == op.N_ACUERDOS
    assert all(m.estado == "PUBLICADA" and len(m.asistentes) >= 9 for m in minutas)
    vencidos = [a for a in acuerdos if a.fecha_limite and a.fecha_limite < hoy and a.estado == "PENDIENTE"]
    assert len(vencidos) >= op.N_ACUERDOS * 0.2
    assert all(a.responsable_id for a in acuerdos)


def test_agenda_y_planes(campaign):
    db, camp = campaign
    agenda = op.generar_agenda(db, camp, random.Random(9)); planes = op.generar_planes(db, camp)
    db.commit()
    assert Counter(a.fase for a in agenda) == {30: 10, 60: 10, 90: 10}
    assert sum(1 for a in agenda if a.done) == 12
    assert len(planes) == 174 and all(p.responsable_id and p.meta_semanal for p in planes)


def test_orquestador_una_sola_vez_y_reset(campaign, monkeypatch):
    db, camp = campaign
    assert op.seed_atizapan_operacion(db, hoy=date(2026, 9, 30)) is True
    assert op.seed_atizapan_operacion(db, hoy=date(2026, 9, 30)) is False
    n_reg = db.execute(select(func.count()).select_from(Registro).where(Registro.campaign_id == camp.id)).scalar_one()
    assert n_reg == op.N_PROMOVIDOS
    # aislamiento: nada en la campaña Alpha
    from tests.conftest import ALPHA_CAMPAIGN_ID
    assert db.execute(select(func.count()).select_from(Registro).where(
        Registro.campaign_id == ALPHA_CAMPAIGN_ID, Registro.promotor == op.MARCADOR)).scalar_one() == 0
    borrado = op.reset_operacion(db, camp)
    assert borrado["registros"] == op.N_PROMOVIDOS and borrado["casos"] == op.N_CASOS
    assert op.ya_sembrado(db, camp) is False
    for model in (Caso, Minuta, Acuerdo, AgendaItem, SeccionPlan, Militante):
        assert db.execute(select(func.count()).select_from(model).where(model.campaign_id == camp.id)).scalar_one() == 0
```

Replace the `campaign` fixture teardown (Task 9) with this fuller cleanup:

```python
    finally:
        db.rollback()
        caso_ids = [i for (i,) in db.execute(select(Caso.id).where(Caso.campaign_id == camp.id)).all()]
        if caso_ids:
            db.execute(CasoEvento.__table__.delete().where(CasoEvento.caso_id.in_(caso_ids)))
        for model in (Militante, Registro, Caso, Acuerdo, Minuta, AgendaItem, SeccionPlan):
            db.execute(model.__table__.delete().where(model.campaign_id == camp.id))
        db.commit()
        db.close()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_demo_atizapan_operacion.py -q`
Expected: 4 FAIL con `AttributeError` (funciones nuevas).

- [ ] **Step 3: Implement (part 2)**

Append to `demo_atizapan_operacion.py`:

```python
from sqlalchemy import delete

from app.models.atencion import Caso, CasoEvento
from app.models.minuta import Acuerdo, Minuta
from app.models.operacion import AgendaItem, SeccionPlan
from app.services import caso_service
from app.services.operacion_service import suggest_meta

N_CASOS, N_MINUTAS, N_ACUERDOS, N_AGENDA_POR_FASE = 60, 12, 40, 10
_TITULOS_CASO = ["Falta de agua en la colonia", "Bache en calle principal", "Luminaria fundida",
                 "Solicitud de patrullaje", "Fuga de drenaje", "Poda de árbol peligroso",
                 "Recolección de basura irregular", "Apoyo para despensa", "Gestión de acta de nacimiento",
                 "Reparación de banqueta", "Semáforo descompuesto", "Apoyo médico para adulto mayor"]
_PROBLEMAS = ["Agua", "Seguridad", "Baches", "Alumbrado", "Basura", "Transporte", "Drenaje"]
_AGENDA = {30: ["Instalar casa de campaña", "Integrar comités seccionales", "Levantar diagnóstico por colonia",
                "Capacitar activistas en captura", "Definir metas semanales", "Abrir canal de atención ciudadana",
                "Mapear liderazgos vecinales", "Calendario de recorridos", "Kit de identidad de campaña", "Padrón de simpatizantes base"],
           60: ["Recorridos en secciones competitivas", "Foros temáticos por zona", "Brigadas de servicios",
                "Revisión de avance por líder", "Segunda ola de capacitación", "Alianzas con comerciantes",
                "Jornadas de afiliación", "Control de calidad de captura", "Plan de redes por zona", "Encuesta interna"],
           90: ["Consolidar estructura de casilla", "Simulacro de defensa del voto", "Cierre de brechas en rojo",
                "Eventos masivos por zona", "Auditoría de padrón capturado", "Plan de movilización",
                "Representantes generales", "Logística día D", "Mensaje de cierre", "Evaluación final de metas"]}


def generar_casos(db: Session, campaign: Campaign, rng: random.Random, hoy: date) -> list[Caso]:
    lideres, act_por_seccion = _estructura(db, campaign)
    coord = db.execute(select(User).where(User.email == f"coordinador@{EMAIL_DOMAIN}")).scalar_one()
    ctx = _ctx(db, campaign, coord)
    primero = caso_service._next_folio(db, ctx)
    prefix, base = primero.rsplit("-", 1)
    secciones = list(act_por_seccion)
    lider_de_seccion = {s: acts[0].lider_id for s, acts in act_por_seccion.items() if acts}
    out = []
    for k in range(N_CASOS):
        sec = rng.choice(secciones)
        u = rng.random()
        if u < 0.40:
            estado, fecha = rng.choice(["PENDIENTE", "EN_PROCESO"]), hoy - timedelta(days=rng.randint(1, 20))
        elif u < 0.75:
            estado, fecha = rng.choice(["ATENDIDO", "CERRADO"]), hoy - timedelta(days=rng.randint(1, 30))
        else:
            estado, fecha = "EN_PROCESO", hoy + timedelta(days=rng.randint(1, 10))
        creado = datetime.combine(hoy - timedelta(days=rng.randint(5, 60)), time(10, 0), tzinfo=timezone.utc)
        c = Caso(organization_id=campaign.organization_id, campaign_id=campaign.id,
                 folio=f"{prefix}-{int(base) + k:05d}", tipo=rng.choice(["PETICION", "QUEJA", "APOYO", "OTRO"]),
                 titulo=rng.choice(_TITULOS_CASO), descripcion="Reporte vecinal levantado en recorrido (demo).",
                 ciudadano_nombre=f"{rng.choice(_NOMBRES)} {rng.choice(_APELLIDOS)}",
                 seccion=sec, colonia=rng.choice(COLONIAS), asignado_a=lider_de_seccion.get(sec, lideres[0].id),
                 estado=estado, prioridad=rng.choice(["ALTA", "MEDIA", "BAJA"]), fecha_compromiso=fecha,
                 created_at=creado, created_by=coord.id)
        db.add(c)
        db.flush()
        db.add(CasoEvento(organization_id=campaign.organization_id, caso_id=c.id, tipo="CAMBIO_ESTADO",
                          estado_nuevo="PENDIENTE", actor_id=coord.id, created_at=creado))
        out.append(c)
    db.flush()
    return out


def generar_minutas(db: Session, campaign: Campaign, rng: random.Random, hoy: date) -> tuple[list[Minuta], list[Acuerdo]]:
    lideres, _ = _estructura(db, campaign)
    coord = db.execute(select(User).where(User.email == f"coordinador@{EMAIL_DOMAIN}")).scalar_one()
    asistentes = [{"user_id": coord.id, "nombre": coord.full_name}] + [{"user_id": l.id, "nombre": l.full_name} for l in lideres]
    minutas, acuerdos = [], []
    lunes = hoy - timedelta(days=hoy.weekday())
    for w in range(N_MINUTAS):
        fecha = lunes - timedelta(weeks=N_MINUTAS - 1 - w)
        m = Minuta(organization_id=campaign.organization_id, campaign_id=campaign.id,
                   titulo=f"Coordinación semanal · semana {w + 1}", fecha=fecha, lugar="Casa de campaña",
                   tipo="REUNION", asistentes=asistentes, estado="PUBLICADA",
                   cuerpo="Revisión de avance por zona, casos abiertos y logística (demo).", created_by=coord.id)
        db.add(m)
        db.flush()
        minutas.append(m)
    por_minuta = distribuir(N_ACUERDOS, {m.id: 1.0 for m in minutas})
    for m in minutas:
        for i in range(por_minuta[m.id]):
            limite = m.fecha + timedelta(days=rng.randint(3, 21))
            vencido = limite < hoy
            estado = "PENDIENTE" if (vencido and rng.random() < 0.45) else ("CUMPLIDO" if vencido else "EN_CURSO")
            a = Acuerdo(organization_id=campaign.organization_id, campaign_id=campaign.id, minuta_id=m.id,
                        texto=f"{rng.choice(['Entregar', 'Revisar', 'Convocar', 'Cerrar'])} {rng.choice(['padrón de zona', 'casos de agua', 'brigada', 'reporte de avance'])}",
                        orden=i, responsable_id=rng.choice(lideres).id, fecha_limite=limite, estado=estado,
                        created_by=coord.id)
            db.add(a)
            acuerdos.append(a)
    db.flush()
    return minutas, acuerdos


def generar_agenda(db: Session, campaign: Campaign, rng: random.Random) -> list[AgendaItem]:
    out = []
    for fase, titulos in _AGENDA.items():
        for i, t in enumerate(titulos):
            out.append(AgendaItem(organization_id=campaign.organization_id, campaign_id=campaign.id, fase=fase,
                                  titulo=t, orden=i, done=(fase == 30 and i < 8) or (fase == 60 and i < 4)))
    db.add_all(out)
    db.flush()
    return out


def generar_planes(db: Session, campaign: Campaign) -> list[SeccionPlan]:
    _, act_por_seccion = _estructura(db, campaign)
    facts = db.execute(select(SeccionElectoral).where(
        SeccionElectoral.municipio_code == campaign.municipio_code, SeccionElectoral.anio == 2024)).scalars().all()
    rng = random.Random(1)
    out = []
    for f in facts:
        acts = act_por_seccion.get(f.seccion) or []
        out.append(SeccionPlan(organization_id=campaign.organization_id, campaign_id=campaign.id, seccion=f.seccion,
                               responsable_id=acts[0].lider_id if acts else None,
                               problema_dominante=rng.choice(_PROBLEMAS), meta_semanal=suggest_meta(f.prioridad),
                               prioridad_operativa=f.prioridad))
    db.add_all(out)
    db.flush()
    return out


def _campaign(db: Session) -> Optional[Campaign]:
    from app.seeds.demo_atizapan import CAMPAIGN_NAME
    slug = os.getenv("SEED_DEMO_ATIZAPAN_ORG_SLUG", "atizapan")
    from app.models.organization import Organization
    org = db.execute(select(Organization).where(Organization.slug == slug)).scalar_one_or_none()
    if org is None:
        return None
    return db.execute(select(Campaign).where(Campaign.organization_id == org.id,
                                             Campaign.name == CAMPAIGN_NAME)).scalar_one_or_none()


def seed_atizapan_operacion(db: Session, hoy: Optional[date] = None) -> bool:
    if os.getenv("SEED_DEMO_ATIZAPAN", "").lower() != "true":
        return False
    campaign = _campaign(db)
    if campaign is None or ya_sembrado(db, campaign):
        return False
    hoy = hoy or date.today()
    rng = random.Random(15013)
    regs = generar_registros(db, campaign, rng, hoy)
    generar_militantes(db, campaign, regs, rng)
    generar_casos(db, campaign, rng, hoy)
    generar_minutas(db, campaign, rng, hoy)
    generar_agenda(db, campaign, rng)
    generar_planes(db, campaign)
    db.commit()
    logger.info("Atizapán operación sintética sembrada: %d promovidos", len(regs))
    return True


def reset_operacion(db: Session, campaign: Campaign) -> dict[str, int]:
    """Borra SOLO lo generado por este seed en esa campaña (marcador / tablas completas de la campaña
    demo). Uso local o de rescate; nunca en el lifespan."""
    cid = campaign.id
    counts = {}
    caso_ids = [i for (i,) in db.execute(select(Caso.id).where(Caso.campaign_id == cid)).all()]
    db.execute(delete(CasoEvento).where(CasoEvento.caso_id.in_(caso_ids or ["-"])))
    for name, model, cond in (
        ("registros", Registro, (Registro.campaign_id == cid) & (Registro.promotor == MARCADOR)),
        ("militantes", Militante, (Militante.campaign_id == cid) & (Militante.promotor == MARCADOR)),
        ("casos", Caso, Caso.campaign_id == cid),
        ("acuerdos", Acuerdo, Acuerdo.campaign_id == cid),
        ("minutas", Minuta, Minuta.campaign_id == cid),
        ("agenda", AgendaItem, AgendaItem.campaign_id == cid),
        ("planes", SeccionPlan, SeccionPlan.campaign_id == cid),
    ):
        counts[name] = db.execute(delete(model).where(cond)).rowcount
    db.commit()
    return counts
```

`backend/scripts/seed_atizapan_operacion.py`:

```python
"""CLI local: siembra (o con --reset borra) la operación sintética de Atizapán.
Requiere SEED_DEMO_ATIZAPAN=true y la org/campaña ya sembradas. Nunca imprime PII."""
import argparse
import sys

from app.database import SessionLocal
from app.seeds import demo_atizapan_operacion as op


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()
    with SessionLocal() as db:
        camp = op._campaign(db)
        if camp is None:
            print("campaña de Atizapán no encontrada (¿SEED_DEMO_ATIZAPAN?)", file=sys.stderr)
            return 2
        if args.reset:
            print(op.reset_operacion(db, camp))
            return 0
        print("sembrado" if op.seed_atizapan_operacion(db) else "ya estaba sembrado / gate apagado")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

`backend/app/main.py` — tras el bloque de `seed_atizapan_campaign`:

```python
    try:
        from app.database import SessionLocal
        from app.seeds.demo_atizapan_operacion import seed_atizapan_operacion

        with SessionLocal() as db:
            seed_atizapan_operacion(db)
    except Exception:
        logger.exception("Atizapán operación seed failed during startup")
```

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && python3 -m pytest -q`
Expected: all passed (baseline + ~35 nuevos). Si alguna suite cuenta filas globales de `Registro`/`Caso`, la fixture `campaign` limpia todo al final de cada test.

- [ ] **Step 5: Commit**

```bash
git add backend/app/seeds/demo_atizapan_operacion.py backend/scripts/seed_atizapan_operacion.py backend/app/main.py backend/tests/test_demo_atizapan_operacion.py
git commit -m "feat(seed): casos, minutas/acuerdos, agenda y planes sintéticos + orquestador de una sola vez y CLI --reset"
```

---

## Task 11: AZ-5 — ejecutar el plan de Alertas y validar con Atizapán

**Files:**
- Ejecutar íntegro `docs/superpowers/plans/2026-09-27-alertas-centro-unificado.md` (Tasks 1–6 de ese plan) sin cambios de alcance.
- Verify: smoke manual en dev.

- [ ] **Step 1: Ejecutar el plan de Alertas** (todas sus tareas, con sus propios commits).

- [ ] **Step 2: Smoke con Atizapán en dev**

```bash
cd backend && SEED_DEMO_TERRITORY=true SEED_DEMO_ATIZAPAN=true SEED_DEMO_ATIZAPAN_PASSWORD='Demo2027!' \
  SEED_ADMIN_EMAIL=ecg@local SEED_ADMIN_PASSWORD='Admin2027!' uvicorn app.main:app --port 8000 &
sleep 8
TOKEN=$(curl -s -X POST localhost:8000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"coordinador@demo.atizapan.mx","password":"Demo2027!"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
CAMP=$(curl -s localhost:8000/api/campaigns/mine -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])')
curl -s localhost:8000/api/alertas -H "Authorization: Bearer $TOKEN" -H "X-Campaign-Id: $CAMP" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["resumen"]);print(sorted({i["regla"] for i in d["items"]}))'
```

Expected: `resumen.secciones_total == 174` y el conjunto de reglas contiene `['O1','O2','O3','O4','O5','T1','T2']` (T1 puede faltar si ninguna persuadible quedó < 60 %; en ese caso ajustar `_PESO` de DEFENDER_EXPANDIR a 0.5 y de persuadibles a 1.4 en `demo_atizapan_operacion.py`, correr `scripts/seed_atizapan_operacion.py --reset` y volver a arrancar).

- [ ] **Step 3: Commit** (solo si hubo ajuste de pesos)

```bash
git commit -am "chore(seed): calibrar pesos de captura para que Alertas muestre las 7 reglas"
```

---

## Task 12: Documentación, env vars y verificación final

**Files:**
- Create: `docs/demo-atizapan.md`
- Modify: `STATUS.md` (sección env vars), `CLAUDE.md` (bloque corto "Demo Atizapán / multi-municipio")

- [ ] **Step 1: Write `docs/demo-atizapan.md`** (sin contraseñas):

```markdown
# Demo Atizapán de Zaragoza 2027 · Luis Montaño (Arturo)

**Entorno:** https://agora-gobtech.up.railway.app · org `Atizapán 2027` (slug `atizapan`).
**Cuentas:** Arturo (ADMIN de la org, su correo habitual) · `coordinador@demo.atizapan.mx` (COORDINADOR)
· `lider01..08@`, `activista01..40@`, `capturista01..02@` — contraseña común: la de `SEED_DEMO_ATIZAPAN_PASSWORD`
(ver Railway → Agora → Variables; no se escribe aquí).

## Guion (30 min)
1. **Centro de Mando** como coordinador: cabecera "Atizapán de Zaragoza 2027 · Luis Montaño (Morena-PVEM-PT)", countdown al 6-jun-2027, ritmo semanal con caída reciente (zonas 3 y 7).
2. **Panorama municipal**: Atizapán por defecto; margen 2024 −33,809 (brecha por cerrar); selector de región → comparar con Tlalnepantla, Naucalpan, Cuautitlán Izcalli, Nicolás Romero, Isidro Fabela y Jilotzingo.
3. **Plan territorial / War Room**: 174 secciones, 51 persuadibles, semáforo con rojos en persuadibles rezagadas.
4. **Alertas**: T1/O1 secciones rezagadas, O2 caída de ritmo, O3 casos con SLA vencido, O4 activistas inactivos, O5 acuerdos vencidos, T2 participación atípica.
5. **Promovidos / Militantes**: 6,000 / 1,200 registros ficticios (marcados `demo-seed`), clave enmascarada; revelar clave auditado.
6. **Atención, Minutas y Acuerdos, Agenda 30/60/90**: casos abiertos y vencidos, 12 minutas publicadas, 40 acuerdos.
7. Como Arturo (ADMIN): usuarios de la org y estructura; no ve nada de otras organizaciones.

## Datos
- Reales: IEEM 2018/2021/2024 por sección, INEGI ITER 2020 (`backend/app/seeds/municipios/<code>/manifest.json` trae URLs y hashes).
- Sintéticos: todo lo operativo; personas y claves ficticias; `scripts/seed_atizapan_operacion.py --reset` los borra (solo local).
```

- [ ] **Step 2: STATUS.md / CLAUDE.md**

En `STATUS.md`, junto a las env vars de seeds, añadir: `SEED_DEMO_ATIZAPAN=true`, `SEED_DEMO_ATIZAPAN_PASSWORD`, `SEED_DEMO_ATIZAPAN_ORG_SLUG` (default `atizapan`), `SEED_DEMO_ATIZAPAN_ADMIN_EMAIL` (re-domicilia ese usuario como ADMIN de la org; irreversible por seed). Eliminar `DEMO_CAMPAIGN_ID`.

En `CLAUDE.md`, tras "Command Center ejecutivo", añadir una sección de ~10 líneas: registro de municipios (`app/seeds/municipios.py`), semántica `coalicion`=propio / `morena`=rival, `Campaign.municipio_code` acota secciones vía `territory_service.secciones_query`, `GET /municipio/region`, seeds de Atizapán y marcador `demo-seed`, y que los CSV se regeneran con `scripts/build_municipio_dataset.py` (nunca en PROD).

- [ ] **Step 3: Verificación final**

Run: `cd backend && python3 -m pytest -q && cd ../frontend && npm run build && npm run test`
Expected: todo verde.

- [ ] **Step 4: Commit**

```bash
git add docs/demo-atizapan.md STATUS.md CLAUDE.md
git commit -m "docs: guion demo Atizapán, env vars de seeds y notas multi-municipio"
```

- [ ] **Step 5: Despliegue (lo hace el usuario)**

En Railway (proyecto Atenea, servicio Agora, env production) añadir `SEED_DEMO_ATIZAPAN=true`, `SEED_DEMO_ATIZAPAN_PASSWORD=<secreto>`, `SEED_DEMO_ATIZAPAN_ADMIN_EMAIL=arturo@atlastech.mx`; mergear la rama a `main`. Verificar tras el deploy: login de Arturo → `/api/campaigns/mine` solo Atizapán; `/api/municipio/region` con 7 municipios; login de Lucy → 22 secciones en `/municipio` y solo SMA en su región; login de ECG → ambas orgs.
