# Alertas · Centro unificado de riesgo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el placeholder `/riesgo` en un centro de alertas real: 7 reglas calculadas al vuelo sobre datos de la campaña, expuestas en `GET /api/alertas` y mostradas en una página con KPIs, filtro, cuadrícula de secciones y lista enlazada.

**Architecture:** Un `alerta_service` backend con una función por regla (las de sección/ritmo son puras sobre datos ya cargados; las de casos/activistas/acuerdos consultan con `scoped_query`), un `evaluar()` que ordena y resume, y un router `GET /alertas` (CampaignCtx, ADMIN/COORDINADOR + superadmin). El frontend solo consume: módulo `modules/alertas/` con lógica pura testeada y la página; más un chip en Inicio.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Pydantic v2 (pytest sobre SQLite en memoria) · React + TypeScript + Vite + Tailwind (Vitest, entorno `node`, `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-09-24-alertas-centro-unificado-design.md`

## Global Constraints

- Umbrales exactos: `AVANCE_ROJO_PCT = 60`, `Z_PARTICIPACION = 1.5`, `MIN_SECCIONES_Z = 5`, `CAIDA_RITMO_PCT = 30`, `MIN_RITMO_BASE = 5`, `DIAS_INACTIVIDAD = 7`; persuadible = `operacion_service._PERSUADIBLE_UMBRAL` (150).
- Estados: caso terminal `("ATENDIDO", "CERRADO")`; acuerdo abierto `("PENDIENTE", "EN_CURSO")`.
- Severidad: `"critica" | "alta" | "media"`; categoría: `"territorial" | "operativa"`. Orden: crítica > alta > media, luego `peso` desc. `peso` nunca se expone.
- Roles de `GET /alertas`: `require_roles(UserRole.ADMIN, UserRole.COORDINADOR)` (superadmin pasa siempre). Sin `X-Campaign-Id` → 400.
- Ninguna alerta contiene datos de ciudadanos (nombre de registro/caso, teléfono, clave). O4 sí muestra el nombre del activista (personal).
- Sin tabla, sin migración, sin `audit_log`. Sin paginar.
- Enlaces: T1 `/plan-territorial`, T2 `/municipio`, O1 `/war-room`, O2 `/`, O3 `/atencion/casos`, O4 `/admin/estructura`, O5 `/acuerdos`.
- Textos de UI en español. Colores solo desde tokens existentes (`--c-critical`, `--c-amber`, `--c-warning`).
- Backend tests: `cd backend && python3 -m pytest …` (si no hay venv: `uv venv /tmp/agora-venv && uv pip install --python /tmp/agora-venv/bin/python -r backend/requirements.txt`, luego usar `/tmp/agora-venv/bin/python -m pytest`). Frontend: `cd frontend && npm run test` / `npm run build`.

## Review Focus

1. `created_at` con zona horaria (PostgreSQL) vs sin zona (SQLite) — debe normalizarse a UTC naive antes de agrupar; Task 1 prueba `regla_ritmo` con datetimes aware.
2. Campaña sin datos (0 secciones, 0 registros, desviación estándar 0) — debe devolver 200 con listas vacías, nunca `ZeroDivisionError`; Task 1 prueba T2 con valores idénticos y O2 con base 0.
3. Activistas dados de baja (`is_active=False`) o recién creados no deben generar O4; Task 2 los prueba.
4. Superadmin con campaña seleccionada pero sin membresía debe recibir 200; Task 3 lo prueba.
5. Datos de otra campaña (Beta) no deben contar en O3/O4/O5 de Alpha; Task 2 prueba aislamiento a nivel servicio.

Nota conocida: `SeccionElectoral` es dato de referencia global (sin campaña), así que la cuadrícula y T1/O1/T2 listan las mismas secciones para toda campaña — comportamiento heredado de `list_planes`, no se cambia aquí.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `backend/app/services/alerta_service.py` | Crear | Reglas, `evaluar()` |
| `backend/app/schemas/alerta.py` | Crear | `Alerta`, `AlertasResumen`, `SeccionSeveridad`, `AlertasResponse` |
| `backend/app/routers/alertas.py` | Crear | `GET /alertas` |
| `backend/app/main.py` | Modificar | Registrar router |
| `backend/tests/test_alertas_reglas.py` | Crear | Reglas puras (sin BD) |
| `backend/tests/test_alertas_service.py` | Crear | O3/O4/O5 con BD + aislamiento |
| `backend/tests/test_alertas_api.py` | Crear | Endpoint: RBAC, 400, T1/O1, resumen, orden, PII |
| `frontend/src/api/alertas.ts` | Crear | Tipos + `getAlertas()` |
| `frontend/src/modules/alertas/logic.ts` | Crear | `ALERTAS_READ`, `SEVERIDAD`, `filtrarAlertas`, `haceCuanto` |
| `frontend/src/modules/alertas/__tests__/logic.test.ts` | Crear | Tests de la lógica |
| `frontend/src/modules/alertas/SeccionGrid.tsx` | Crear | Cuadrícula de secciones (componente puro) |
| `frontend/src/modules/alertas/AlertasPage.tsx` | Crear | Página |
| `frontend/src/modules/registry.ts` | Modificar | `riesgo` → active |
| `frontend/src/pages/DashboardPage.tsx` | Modificar | Chip de alertas críticas |

---

### Task 1: Reglas puras (T1, O1, T2, O2)

**Files:**
- Create: `backend/app/services/alerta_service.py`
- Test: `backend/tests/test_alertas_reglas.py`

**Interfaces:**
- Consumes: forma de fila de `operacion_service.list_planes` → `{"seccion": str, "electoral": {"participacion": float|None, "persuadible": bool, ...}, "avance": {"promovidos": int, "meta": int|None, "pct": int|None}, ...}`.
- Produces:
  - `_alerta(regla, categoria, severidad, sujeto, titulo, detalle, enlace, *, seccion=None, valor=None, umbral=None, peso=0.0) -> dict` con claves `clave, regla, categoria, severidad, titulo, detalle, seccion, valor, umbral, enlace, peso`.
  - `_naive_utc(dt: datetime) -> datetime`
  - `reglas_seccion(planes: list[dict]) -> list[dict]` (T1/O1)
  - `regla_participacion(planes: list[dict]) -> list[dict]` (T2)
  - `regla_ritmo(fechas: list[datetime], hoy: date) -> list[dict]` (O2)
  - Constantes del módulo (ver Global Constraints) y `_SEVERIDAD_RANGO = {"critica": 0, "alta": 1, "media": 2}`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_alertas_reglas.py`:

```python
"""Reglas puras de Alertas (sin BD): T1/O1 por sección, T2 participación, O2 ritmo."""
from datetime import date, datetime, timedelta, timezone

from app.services import alerta_service as svc


def _plan(seccion, pct, persuadible=False, participacion=None, meta=30, promovidos=0):
    return {
        "seccion": seccion,
        "electoral": {"participacion": participacion, "persuadible": persuadible,
                      "margen": None, "prioridad": None},
        "avance": {"promovidos": promovidos, "meta": meta, "pct": pct},
    }


def test_t1_persuadible_rezagada_es_critica_y_excluye_o1():
    out = svc.reglas_seccion([_plan("4121", 34, persuadible=True, meta=30, promovidos=10)])
    assert [a["clave"] for a in out] == ["T1:4121"]
    a = out[0]
    assert a["severidad"] == "critica" and a["categoria"] == "territorial"
    assert a["valor"] == 34 and a["umbral"] == 60 and a["seccion"] == "4121"
    assert a["enlace"] == "/plan-territorial"
    assert a["peso"] == 20  # faltan 30 - 10


def test_o1_no_persuadible_rezagada_es_alta():
    out = svc.reglas_seccion([_plan("4122", 10, persuadible=False)])
    assert [a["clave"] for a in out] == ["O1:4122"]
    assert out[0]["severidad"] == "alta" and out[0]["categoria"] == "operativa"
    assert out[0]["enlace"] == "/war-room"


def test_seccion_al_dia_o_sin_pct_no_alerta():
    planes = [_plan("1", 60, persuadible=True), _plan("2", 100), _plan("3", None)]
    assert svc.reglas_seccion(planes) == []


def test_t2_participacion_atipica_alta():
    valores = {"a": 60.0, "b": 61.0, "c": 62.0, "d": 60.0, "e": 61.0, "f": 85.0}
    planes = [_plan(s, 100, participacion=v) for s, v in valores.items()]
    out = svc.regla_participacion(planes)
    assert [a["clave"] for a in out] == ["T2:f"]
    a = out[0]
    assert a["severidad"] == "media" and a["enlace"] == "/municipio"
    assert "alta" in a["titulo"] and a["valor"] == 85.0


def test_t2_se_omite_con_pocas_secciones_o_sin_varianza():
    pocas = [_plan(str(i), 100, participacion=50.0 + i * 10) for i in range(4)]
    assert svc.regla_participacion(pocas) == []
    iguales = [_plan(str(i), 100, participacion=60.0) for i in range(8)]
    assert svc.regla_participacion(iguales) == []
    sin_dato = [_plan(str(i), 100, participacion=None) for i in range(8)]
    assert svc.regla_participacion(sin_dato) == []


# hoy = miércoles 2026-09-23 → lunes de la semana actual = 2026-09-21.
_HOY = date(2026, 9, 23)
_LUNES = date(2026, 9, 21)


def _en_semana(idx: int, n: int, aware: bool = False) -> list[datetime]:
    """n datetimes dentro de la semana completa idx (0 = la última completa)."""
    d = _LUNES - timedelta(days=7 * idx + 3)
    dt = datetime(d.year, d.month, d.day, 12, 0)
    if aware:
        dt = dt.replace(tzinfo=timezone.utc)
    return [dt] * n


def test_o2_caida_de_ritmo_dispara():
    fechas = _en_semana(0, 3) + sum((_en_semana(i, 10) for i in range(1, 5)), [])
    out = svc.regla_ritmo(fechas, _HOY)
    assert [a["clave"] for a in out] == ["O2:campaña"]
    assert out[0]["valor"] == -70 and out[0]["umbral"] == -30
    assert out[0]["severidad"] == "alta" and out[0]["enlace"] == "/"


def test_o2_acepta_datetimes_con_zona_horaria():
    fechas = _en_semana(0, 3, aware=True) + sum((_en_semana(i, 10, aware=True) for i in range(1, 5)), [])
    assert [a["clave"] for a in svc.regla_ritmo(fechas, _HOY)] == ["O2:campaña"]


def test_o2_no_dispara_con_caida_leve_semana_actual_o_base_chica():
    leve = _en_semana(0, 9) + sum((_en_semana(i, 10) for i in range(1, 5)), [])
    assert svc.regla_ritmo(leve, _HOY) == []
    # la semana en curso no cuenta como "última completa"
    actual = [datetime(2026, 9, 22, 9, 0)] * 50 + sum((_en_semana(i, 10) for i in range(0, 5)), [])
    assert svc.regla_ritmo(actual, _HOY) == []
    base_chica = sum((_en_semana(i, 2) for i in range(1, 5)), [])
    assert svc.regla_ritmo(base_chica, _HOY) == []
    assert svc.regla_ritmo([], _HOY) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_alertas_reglas.py -v`
Expected: FAIL — `ImportError: cannot import name 'alerta_service'`.

- [ ] **Step 3: Write minimal implementation**

`backend/app/services/alerta_service.py`:

```python
"""Alertas — centro unificado de riesgo (cálculo al vuelo, sin persistencia).

Cada regla devuelve una lista de alertas (dicts). ``evaluar`` las ejecuta,
ordena por severidad y peso, y arma el resumen y la cuadrícula por sección.
Spec: docs/superpowers/specs/2026-09-24-alertas-centro-unificado-design.md
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from statistics import mean, pstdev
from typing import Optional

from app.services import operacion_service

AVANCE_ROJO_PCT = 60
Z_PARTICIPACION = 1.5
MIN_SECCIONES_Z = 5
CAIDA_RITMO_PCT = 30
MIN_RITMO_BASE = 5
DIAS_INACTIVIDAD = 7

_SEVERIDAD_RANGO = {"critica": 0, "alta": 1, "media": 2}


def _alerta(regla: str, categoria: str, severidad: str, sujeto: str, titulo: str,
            detalle: str, enlace: str, *, seccion: Optional[str] = None,
            valor: Optional[float] = None, umbral: Optional[float] = None,
            peso: float = 0.0) -> dict:
    return {
        "clave": f"{regla}:{sujeto}", "regla": regla, "categoria": categoria,
        "severidad": severidad, "titulo": titulo, "detalle": detalle,
        "seccion": seccion, "valor": valor, "umbral": umbral, "enlace": enlace,
        "peso": float(peso),
    }


def _naive_utc(dt: datetime) -> datetime:
    """PostgreSQL devuelve timestamps con zona; SQLite sin zona. Normaliza a UTC naive."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def reglas_seccion(planes: list[dict]) -> list[dict]:
    """T1 (persuadible rezagada, crítica) y O1 (en rojo, alta) — excluyentes por sección."""
    out: list[dict] = []
    for p in planes:
        pct = p["avance"]["pct"]
        if pct is None or pct >= AVANCE_ROJO_PCT:
            continue
        s = p["seccion"]
        faltan = max(0, (p["avance"]["meta"] or 0) - p["avance"]["promovidos"])
        if p["electoral"]["persuadible"]:
            out.append(_alerta(
                "T1", "territorial", "critica", s,
                f"Sección {s} persuadible con {pct}% de avance",
                f"Margen 2024 ≤{operacion_service._PERSUADIBLE_UMBRAL} votos y avance "
                f"<{AVANCE_ROJO_PCT}% de la meta",
                "/plan-territorial", seccion=s, valor=pct, umbral=AVANCE_ROJO_PCT, peso=faltan))
        else:
            out.append(_alerta(
                "O1", "operativa", "alta", s,
                f"Sección {s} en rojo: {pct}% de avance",
                f"Avance <{AVANCE_ROJO_PCT}% de la meta de promovidos",
                "/war-room", seccion=s, valor=pct, umbral=AVANCE_ROJO_PCT, peso=faltan))
    return out


def regla_participacion(planes: list[dict]) -> list[dict]:
    """T2 — participación 2024 atípica frente a las demás secciones (|z| > umbral)."""
    datos = [(p["seccion"], float(p["electoral"]["participacion"]))
             for p in planes if p["electoral"]["participacion"] is not None]
    if len(datos) < MIN_SECCIONES_Z:
        return []
    valores = [v for _, v in datos]
    media, sd = mean(valores), pstdev(valores)
    if sd == 0:
        return []
    out: list[dict] = []
    for s, v in datos:
        z = (v - media) / sd
        if abs(z) <= Z_PARTICIPACION:
            continue
        sentido = "alta" if z > 0 else "baja"
        out.append(_alerta(
            "T2", "territorial", "media", s,
            f"Sección {s}: participación atípicamente {sentido} ({v:.1f}%)",
            f"Participación 2024 a más de {Z_PARTICIPACION} desviaciones estándar del "
            f"promedio de las secciones ({media:.1f}%)",
            "/municipio", seccion=s, valor=round(v, 1), umbral=round(media, 1), peso=abs(z)))
    return out


def regla_ritmo(fechas: list[datetime], hoy: date) -> list[dict]:
    """O2 — promovidos de la última semana ISO completa vs promedio de las 4 anteriores."""
    lunes = hoy - timedelta(days=hoy.weekday())
    semanas = [0] * 5  # [0] = última semana completa; [1..4] = base
    for dt in fechas:
        dias_antes = (lunes - _naive_utc(dt).date()).days
        if dias_antes <= 0:
            continue  # semana en curso
        idx = (dias_antes - 1) // 7
        if idx < 5:
            semanas[idx] += 1
    base = mean(semanas[1:])
    if base < MIN_RITMO_BASE:
        return []
    ultima = semanas[0]
    cambio = (ultima - base) / base * 100
    if cambio >= -CAIDA_RITMO_PCT:
        return []
    return [_alerta(
        "O2", "operativa", "alta", "campaña",
        f"Ritmo semanal {round(cambio)}% vs promedio de 4 semanas",
        f"Promovidos de la última semana completa ({ultima}) contra el promedio de las "
        f"4 anteriores ({base:.1f}); umbral −{CAIDA_RITMO_PCT}%",
        "/", valor=round(cambio), umbral=-CAIDA_RITMO_PCT, peso=-cambio)]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_alertas_reglas.py -v`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/alerta_service.py backend/tests/test_alertas_reglas.py
git commit -m "feat(alertas): reglas puras T1/O1/T2/O2"
```

---

### Task 2: Reglas con BD (O3 casos, O4 inactivos, O5 acuerdos)

**Files:**
- Modify: `backend/app/services/alerta_service.py`
- Test: `backend/tests/test_alertas_service.py`

**Interfaces:**
- Consumes: `_alerta`, `_naive_utc`, `DIAS_INACTIVIDAD` (Task 1); `scoped_query(model, ctx)` de `app.core.scoping`; `CampaignContext` de `app.dependencies`.
- Produces:
  - `regla_casos(db: Session, ctx: CampaignContext, hoy: date) -> list[dict]` (O3, ≤1 alerta, `clave "O3:campaña"`, `valor` = conteo)
  - `regla_inactivos(db, ctx, hoy) -> list[dict]` (O4, una por persona, `clave "O4:<user_id>"`)
  - `regla_acuerdos(db, ctx, hoy) -> list[dict]` (O5, ≤1 alerta, `clave "O5:campaña"`)

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_alertas_service.py`:

```python
"""Reglas de Alertas con BD: O3 casos SLA, O4 activistas inactivos, O5 acuerdos
vencidos — y aislamiento entre campañas. Los conteos se prueban por delta porque
la BD de pruebas es compartida entre archivos."""
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, select

from tests.conftest import ALPHA_CAMPAIGN_ID, BETA_CAMPAIGN_ID, PASSWORD, TestingSessionLocal
from app.core.security import hash_password
from app.dependencies import CampaignContext
from app.models.atencion import Caso
from app.models.campaign import CampaignMembership
from app.models.minuta import Acuerdo, Minuta
from app.models.registro import Registro
from app.models.user import User, UserRole
from app.services import alerta_service as svc

_MARK = "TEST_ALERTAS"
_HOY = datetime.now(timezone.utc).date()


def _now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _ctx(db, email: str, campaign_id: str) -> CampaignContext:
    u = db.execute(select(User).where(User.email == email)).scalar_one()
    return CampaignContext(user=u, organization_id=u.organization_id, role=u.role,
                           campaign_id=campaign_id)


@pytest.fixture
def db():
    s = TestingSessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        ids = [u.id for u in s.execute(select(User).where(User.email.like("%alertas%"))).scalars()]
        s.execute(delete(Registro).where(Registro.nombre_completo.like(f"{_MARK}%")))
        s.execute(delete(Caso).where(Caso.titulo.like(f"{_MARK}%")))
        s.execute(delete(Acuerdo).where(Acuerdo.texto.like(f"{_MARK}%")))
        s.execute(delete(Minuta).where(Minuta.titulo.like(f"{_MARK}%")))
        if ids:
            s.execute(delete(CampaignMembership).where(CampaignMembership.user_id.in_(ids)))
            s.execute(delete(User).where(User.id.in_(ids)))
        s.commit()
        s.close()


def _caso(ctx, folio, fecha, estado="PENDIENTE", campaign_id=ALPHA_CAMPAIGN_ID):
    return Caso(organization_id=ctx.organization_id, campaign_id=campaign_id, folio=folio,
                tipo="QUEJA", titulo=f"{_MARK} caso", estado=estado, fecha_compromiso=fecha)


def _o3_valor(db, ctx) -> int:
    out = svc.regla_casos(db, ctx, _HOY)
    return int(out[0]["valor"]) if out else 0


def test_o3_cuenta_solo_casos_abiertos_vencidos(db):
    ctx = _ctx(db, "coord@alpha.gov", ALPHA_CAMPAIGN_ID)
    antes = _o3_valor(db, ctx)
    ayer, manana = _HOY - timedelta(days=1), _HOY + timedelta(days=1)
    db.add_all([
        _caso(ctx, "AC-TEST-A1", ayer),
        _caso(ctx, "AC-TEST-A2", ayer),
        _caso(ctx, "AC-TEST-A3", ayer, estado="CERRADO"),   # terminal → no cuenta
        _caso(ctx, "AC-TEST-A4", manana),                   # no vencido
        _caso(ctx, "AC-TEST-A5", None),                     # sin compromiso
    ])
    db.commit()
    out = svc.regla_casos(db, ctx, _HOY)
    assert out and out[0]["clave"] == "O3:campaña"
    assert out[0]["valor"] == antes + 2
    assert out[0]["severidad"] == "alta" and out[0]["enlace"] == "/atencion/casos"


def test_o5_cuenta_solo_acuerdos_abiertos_vencidos(db):
    ctx = _ctx(db, "coord@alpha.gov", ALPHA_CAMPAIGN_ID)
    antes_out = svc.regla_acuerdos(db, ctx, _HOY)
    antes = int(antes_out[0]["valor"]) if antes_out else 0
    m = Minuta(organization_id=ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
               titulo=f"{_MARK} minuta", fecha=_HOY)
    db.add(m); db.flush()
    ayer = _HOY - timedelta(days=1)
    db.add_all([
        Acuerdo(organization_id=ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                minuta_id=m.id, texto=f"{_MARK} 1", fecha_limite=ayer, estado="PENDIENTE"),
        Acuerdo(organization_id=ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                minuta_id=m.id, texto=f"{_MARK} 2", fecha_limite=ayer, estado="EN_CURSO"),
        Acuerdo(organization_id=ctx.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                minuta_id=m.id, texto=f"{_MARK} 3", fecha_limite=ayer, estado="CUMPLIDO"),
    ])
    db.commit()
    out = svc.regla_acuerdos(db, ctx, _HOY)
    assert out and out[0]["clave"] == "O5:campaña" and out[0]["valor"] == antes + 2
    assert out[0]["severidad"] == "media" and out[0]["enlace"] == "/acuerdos"


def _activista(db, email, dias_alta, activo=True, campaign_id=ALPHA_CAMPAIGN_ID):
    alpha_org = db.execute(select(User).where(User.email == "coord@alpha.gov")).scalar_one().organization_id
    u = User(email=email, full_name=email.split("@")[0], hashed_password=hash_password(PASSWORD),
             role=UserRole.ACTIVISTA, organization_id=alpha_org, is_active=activo,
             created_at=_now_naive() - timedelta(days=dias_alta))
    db.add(u); db.flush()
    db.add(CampaignMembership(user_id=u.id, campaign_id=campaign_id, role=UserRole.ACTIVISTA))
    return u


def _registro(db, u, dias_atras):
    db.add(Registro(organization_id=u.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                    nombre_completo=f"{_MARK} promovido", consentimiento=True,
                    activista_id=u.id, created_at=_now_naive() - timedelta(days=dias_atras)))


def test_o4_activista_inactivo(db):
    ctx = _ctx(db, "coord@alpha.gov", ALPHA_CAMPAIGN_ID)
    inactivo = _activista(db, "inactivo.alertas@alpha.gov", 30)
    _registro(db, inactivo, 9)
    activo = _activista(db, "activo.alertas@alpha.gov", 30)
    _registro(db, activo, 2)
    nunca = _activista(db, "nunca.alertas@alpha.gov", 20)          # sin registros
    nuevo = _activista(db, "nuevo.alertas@alpha.gov", 1)           # recién dado de alta
    baja = _activista(db, "baja.alertas@alpha.gov", 30, activo=False)
    db.commit()
    claves = {a["clave"]: a for a in svc.regla_inactivos(db, ctx, _HOY)}
    assert f"O4:{inactivo.id}" in claves
    assert claves[f"O4:{inactivo.id}"]["valor"] == 9
    assert "hace 9 días" in claves[f"O4:{inactivo.id}"]["titulo"]
    assert f"O4:{nunca.id}" in claves
    assert "desde su alta" in claves[f"O4:{nunca.id}"]["titulo"]
    for u in (activo, nuevo, baja):
        assert f"O4:{u.id}" not in claves
    assert claves[f"O4:{inactivo.id}"]["enlace"] == "/admin/estructura"


def test_aislamiento_entre_campanas(db):
    beta = _ctx(db, "admin@beta.gov", BETA_CAMPAIGN_ID)
    alpha = _ctx(db, "coord@alpha.gov", ALPHA_CAMPAIGN_ID)
    antes = _o3_valor(db, beta)
    db.add(_caso(alpha, "AC-TEST-ISO", _HOY - timedelta(days=3)))
    u = _activista(db, "iso.alertas@alpha.gov", 30)
    db.commit()
    assert _o3_valor(db, beta) == antes
    assert f"O4:{u.id}" not in {a["clave"] for a in svc.regla_inactivos(db, beta, _HOY)}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_alertas_service.py -v`
Expected: FAIL — `AttributeError: module 'app.services.alerta_service' has no attribute 'regla_casos'`.

- [ ] **Step 3: Write minimal implementation**

In `backend/app/services/alerta_service.py`, extend the imports block to:

```python
from datetime import date, datetime, timedelta, timezone
from statistics import mean, pstdev
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.atencion import Caso
from app.models.campaign import CampaignMembership
from app.models.minuta import Acuerdo
from app.models.registro import Registro
from app.models.user import User, UserRole
from app.services import operacion_service
```

Add after `_SEVERIDAD_RANGO`:

```python
_CASO_TERMINAL = ("ATENDIDO", "CERRADO")
_ACUERDO_ABIERTO = ("PENDIENTE", "EN_CURSO")
```

Append at the end of the module:

```python
def regla_casos(db: Session, ctx: CampaignContext, hoy: date) -> list[dict]:
    """O3 — casos abiertos con fecha compromiso vencida (una alerta con el conteo)."""
    base = scoped_query(Caso, ctx).subquery()
    n = db.execute(select(func.count()).select_from(base).where(
        base.c.fecha_compromiso.isnot(None),
        base.c.fecha_compromiso < hoy,
        base.c.estado.notin_(_CASO_TERMINAL),
    )).scalar_one()
    if not n:
        return []
    return [_alerta(
        "O3", "operativa", "alta", "campaña",
        f"{n} {'caso' if n == 1 else 'casos'} con SLA vencido",
        "Casos abiertos cuya fecha compromiso ya pasó",
        "/atencion/casos", valor=n, umbral=0, peso=n)]


def regla_acuerdos(db: Session, ctx: CampaignContext, hoy: date) -> list[dict]:
    """O5 — acuerdos de minutas abiertos con fecha límite vencida."""
    base = scoped_query(Acuerdo, ctx).subquery()
    n = db.execute(select(func.count()).select_from(base).where(
        base.c.fecha_limite.isnot(None),
        base.c.fecha_limite < hoy,
        base.c.estado.in_(_ACUERDO_ABIERTO),
    )).scalar_one()
    if not n:
        return []
    return [_alerta(
        "O5", "operativa", "media", "campaña",
        f"{n} {'acuerdo vencido' if n == 1 else 'acuerdos vencidos'}",
        "Acuerdos pendientes o en curso con fecha límite ya pasada",
        "/acuerdos", valor=n, umbral=0, peso=n)]


def regla_inactivos(db: Session, ctx: CampaignContext, hoy: date) -> list[dict]:
    """O4 — activistas/capturistas de la campaña sin registros en DIAS_INACTIVIDAD días."""
    limite = hoy - timedelta(days=DIAS_INACTIVIDAD)
    miembros = db.execute(
        select(User)
        .join(CampaignMembership, CampaignMembership.user_id == User.id)
        .where(
            CampaignMembership.campaign_id == ctx.campaign_id,
            CampaignMembership.deleted_at.is_(None),
            User.organization_id == ctx.organization_id,
            User.role.in_((UserRole.ACTIVISTA, UserRole.CAPTURISTA)),
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
    ).scalars().all()
    if not miembros:
        return []
    ultima = dict(db.execute(
        scoped_query(Registro, ctx)
        .with_only_columns(Registro.activista_id, func.max(Registro.created_at))
        .where(Registro.activista_id.in_([u.id for u in miembros]))
        .group_by(Registro.activista_id)
    ).all())
    out: list[dict] = []
    for u in miembros:
        alta = _naive_utc(u.created_at).date()
        if alta > limite:
            continue  # recién dado de alta
        last = ultima.get(u.id)
        if last is not None and _naive_utc(last).date() > limite:
            continue
        desde = _naive_utc(last).date() if last is not None else alta
        dias = (hoy - desde).days
        titulo = (f"{u.full_name} sin capturas hace {dias} días" if last is not None
                  else f"{u.full_name} sin capturas desde su alta ({dias} días)")
        out.append(_alerta(
            "O4", "operativa", "media", u.id, titulo,
            f"Activista o capturista sin registros en los últimos {DIAS_INACTIVIDAD} días",
            "/admin/estructura", valor=dias, umbral=DIAS_INACTIVIDAD, peso=dias))
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_alertas_service.py tests/test_alertas_reglas.py -v`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/alerta_service.py backend/tests/test_alertas_service.py
git commit -m "feat(alertas): reglas O3 casos SLA, O4 inactivos, O5 acuerdos vencidos"
```

---

### Task 3: `evaluar()` + schemas + `GET /api/alertas`

**Files:**
- Modify: `backend/app/services/alerta_service.py`
- Create: `backend/app/schemas/alerta.py`
- Create: `backend/app/routers/alertas.py`
- Modify: `backend/app/main.py` (import block at line ~25 and tuple in `_register_routers`, line ~231)
- Test: `backend/tests/test_alertas_api.py`

**Interfaces:**
- Consumes: all rule functions from Tasks 1–2; `operacion_service.list_planes(db, ctx) -> list[dict]`.
- Produces:
  - `evaluar(db: Session, ctx: CampaignContext, hoy: Optional[date] = None) -> dict` with keys `resumen`, `secciones`, `items`, `evaluado_en`.
  - HTTP `GET /api/alertas` → `AlertasResponse` JSON:
    `{"resumen": {"critica","alta","media","territorial","operativa","secciones_afectadas","secciones_total"}, "secciones": [{"seccion","severidad_max"}], "items": [{"clave","regla","categoria","severidad","titulo","detalle","seccion","valor","umbral","enlace"}], "evaluado_en": ISO-8601}`

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_alertas_api.py`:

```python
"""GET /api/alertas — RBAC, campaña requerida, T1/O1 de punta a punta, resumen,
orden y ausencia de PII ciudadana."""
from datetime import date, timedelta

import pytest
from sqlalchemy import delete, select

from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers
from app.models.atencion import Caso
from app.models.organization import Organization
from app.models.registro import Registro
from app.models.seccion_electoral import SeccionElectoral

_T1, _O1 = "8891", "8892"
_SECRETO_CASO = "Ciudadana Secreta Alertas"
_SECRETO_REG = "Promovido Secreto Alertas"
_RANGO = {"critica": 0, "alta": 1, "media": 2}


def _hdr(client, email):
    return {**auth_headers(client, email), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}


@pytest.fixture(autouse=True)
def _seed():
    db = TestingSessionLocal()
    try:
        org_id = db.execute(select(Organization).where(Organization.slug == "alpha")).scalar_one().id
        db.add_all([
            SeccionElectoral(seccion=_T1, municipio="San Mateo Atenco", anio=2024,
                             margen=50, participacion=64.0, prioridad="ALTA_PERSUADIBLE"),
            SeccionElectoral(seccion=_O1, municipio="San Mateo Atenco", anio=2024,
                             margen=900, participacion=63.0, prioridad="RECUPERAR_OPOSICION"),
            Registro(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID,
                     nombre_completo=_SECRETO_REG, seccion=_T1, consentimiento=True),
            Caso(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID, folio="AC-TEST-PII",
                 tipo="QUEJA", titulo="Caso alertas", ciudadano_nombre=_SECRETO_CASO,
                 estado="PENDIENTE", fecha_compromiso=date.today() - timedelta(days=5)),
        ])
        db.commit()
    finally:
        db.close()
    yield
    db = TestingSessionLocal()
    try:
        db.execute(delete(SeccionElectoral).where(SeccionElectoral.seccion.in_([_T1, _O1])))
        db.execute(delete(Registro).where(Registro.nombre_completo == _SECRETO_REG))
        db.execute(delete(Caso).where(Caso.folio == "AC-TEST-PII"))
        db.commit()
    finally:
        db.close()


def test_requiere_campana(client):
    r = client.get("/api/alertas", headers=auth_headers(client, "coord@alpha.gov"))
    assert r.status_code == 400


@pytest.mark.parametrize("email", ["coord@alpha.gov", "admin@alpha.gov", "super@atlas.gov"])
def test_roles_permitidos(client, email):
    assert client.get("/api/alertas", headers=_hdr(client, email)).status_code == 200


@pytest.mark.parametrize("email", [
    "lider@alpha.gov", "activista1@alpha.gov", "capturista@alpha.gov",
    "consulta@alpha.gov", "analyst@alpha.gov", "viewer@alpha.gov",
])
def test_roles_denegados(client, email):
    assert client.get("/api/alertas", headers=_hdr(client, email)).status_code == 403


def test_t1_y_o1_de_punta_a_punta(client):
    body = client.get("/api/alertas", headers=_hdr(client, "coord@alpha.gov")).json()
    claves = {a["clave"]: a for a in body["items"]}
    assert claves[f"T1:{_T1}"]["severidad"] == "critica"
    assert claves[f"O1:{_O1}"]["severidad"] == "alta"
    assert f"O1:{_T1}" not in claves and f"T1:{_O1}" not in claves
    celdas = {c["seccion"]: c["severidad_max"] for c in body["secciones"]}
    assert celdas[_T1] == "critica" and celdas[_O1] == "alta"
    assert "peso" not in claves[f"T1:{_T1}"]


def test_resumen_cuadra_y_orden(client):
    body = client.get("/api/alertas", headers=_hdr(client, "coord@alpha.gov")).json()
    items, res = body["items"], body["resumen"]
    for sev in ("critica", "alta", "media"):
        assert res[sev] == sum(1 for a in items if a["severidad"] == sev)
    for cat in ("territorial", "operativa"):
        assert res[cat] == sum(1 for a in items if a["categoria"] == cat)
    assert res["secciones_total"] == len(body["secciones"])
    assert res["secciones_afectadas"] == sum(1 for c in body["secciones"] if c["severidad_max"])
    rangos = [_RANGO[a["severidad"]] for a in items]
    assert rangos == sorted(rangos)
    assert body["evaluado_en"]


def test_sin_pii_ciudadana(client):
    r = client.get("/api/alertas", headers=_hdr(client, "coord@alpha.gov"))
    assert r.status_code == 200
    assert any(a["regla"] == "O3" for a in r.json()["items"])
    assert _SECRETO_CASO not in r.text and _SECRETO_REG not in r.text
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_alertas_api.py -v`
Expected: FAIL — requests return 404 (route not registered).

- [ ] **Step 3: Implement `evaluar`, schemas, router, registration**

Append to `backend/app/services/alerta_service.py`:

```python
def evaluar(db: Session, ctx: CampaignContext, hoy: Optional[date] = None) -> dict:
    """Ejecuta las 7 reglas, ordena (severidad, peso desc) y arma resumen + cuadrícula."""
    hoy = hoy or datetime.now(timezone.utc).date()
    planes = operacion_service.list_planes(db, ctx)
    fechas = db.execute(
        scoped_query(Registro, ctx).with_only_columns(Registro.created_at)
    ).scalars().all()

    items = (
        reglas_seccion(planes)
        + regla_participacion(planes)
        + regla_ritmo([f for f in fechas if f is not None], hoy)
        + regla_casos(db, ctx, hoy)
        + regla_inactivos(db, ctx, hoy)
        + regla_acuerdos(db, ctx, hoy)
    )
    items.sort(key=lambda a: (_SEVERIDAD_RANGO[a["severidad"]], -a["peso"]))

    peor: dict[str, str] = {}
    for a in items:  # ya ordenadas: la primera por sección es la más severa
        if a["seccion"] and a["seccion"] not in peor:
            peor[a["seccion"]] = a["severidad"]
    secciones = [{"seccion": p["seccion"], "severidad_max": peor.get(p["seccion"])}
                 for p in planes]

    def _cuenta(campo: str, valor: str) -> int:
        return sum(1 for a in items if a[campo] == valor)

    resumen = {
        "critica": _cuenta("severidad", "critica"),
        "alta": _cuenta("severidad", "alta"),
        "media": _cuenta("severidad", "media"),
        "territorial": _cuenta("categoria", "territorial"),
        "operativa": _cuenta("categoria", "operativa"),
        "secciones_afectadas": sum(1 for c in secciones if c["severidad_max"]),
        "secciones_total": len(secciones),
    }
    return {"resumen": resumen, "secciones": secciones, "items": items,
            "evaluado_en": datetime.now(timezone.utc)}
```

Create `backend/app/schemas/alerta.py`:

```python
"""Alertas — schemas del centro unificado de riesgo (sin PII ciudadana)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

Severidad = Literal["critica", "alta", "media"]


class Alerta(BaseModel):
    clave: str
    regla: str
    categoria: Literal["territorial", "operativa"]
    severidad: Severidad
    titulo: str
    detalle: str
    seccion: Optional[str] = None
    valor: Optional[float] = None
    umbral: Optional[float] = None
    enlace: str


class AlertasResumen(BaseModel):
    critica: int
    alta: int
    media: int
    territorial: int
    operativa: int
    secciones_afectadas: int
    secciones_total: int


class SeccionSeveridad(BaseModel):
    seccion: str
    severidad_max: Optional[Severidad] = None


class AlertasResponse(BaseModel):
    resumen: AlertasResumen
    secciones: list[SeccionSeveridad]
    items: list[Alerta]
    evaluado_en: datetime
```

Create `backend/app/routers/alertas.py`:

```python
"""Alertas — centro unificado de riesgo (lectura agregada, campaign-scoped)."""
from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.alerta import AlertasResponse
from app.services import alerta_service

# Ejecutivo de campaña: admin + coordinador (superadmin pasa siempre).
_READ = Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.COORDINADOR))]

router = APIRouter(prefix="/alertas", tags=["alertas"])


@router.get("", response_model=AlertasResponse)
def listar(db: DbSession, ctx: CampaignCtx, _p: _READ) -> AlertasResponse:
    return AlertasResponse(**alerta_service.evaluar(db, ctx))
```

Modify `backend/app/main.py`: add `alertas,` to the `from app.routers import (...)` block (alphabetical, right after `admin,`), and add `alertas` to the tuple inside `_register_routers` (e.g. right after `scrum`):

```python
    for module in (health, auth, users, organizations, campaigns, maps, analytics, sources, audit, intel, catalogs, dashboard, territory, ingest, exports, registros, militantes, municipio, operacion, promovidos, privacy, admin, arco, reports, forms, responses, casos, public_forms, minutas, scrum, alertas):
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_alertas_api.py tests/test_alertas_service.py tests/test_alertas_reglas.py -v`
Expected: 25 passed (13 API incl. parametrized, 4 service, 8 reglas).

Then the full suite to check nothing else broke:
Run: `cd backend && python3 -m pytest -q`
Expected: all pass (baseline count + the new tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/alerta_service.py backend/app/schemas/alerta.py backend/app/routers/alertas.py backend/app/main.py backend/tests/test_alertas_api.py
git commit -m "feat(alertas): evaluar() + GET /api/alertas (ADMIN/COORDINADOR, campaign-scoped)"
```

---

### Task 4: Frontend — cliente API + lógica pura

**Files:**
- Create: `frontend/src/api/alertas.ts`
- Create: `frontend/src/modules/alertas/logic.ts`
- Test: `frontend/src/modules/alertas/__tests__/logic.test.ts`

**Interfaces:**
- Consumes: JSON de `GET /api/alertas` (Task 3); `apiClient` de `@/api/client` (añade `X-Campaign-Id` solo).
- Produces:
  - `api/alertas.ts`: tipos `Severidad`, `Categoria`, `Alerta`, `SeccionSeveridad`, `AlertasResponse`; `getAlertas(): Promise<AlertasResponse>`.
  - `modules/alertas/logic.ts`: `ALERTAS_READ: UserRole[]`, `type FiltroCategoria = "todas" | Categoria`, `SEVERIDAD: Record<Severidad, { label: string; color: string; pill: "crit" | "warn" }>`, `filtrarAlertas(items, categoria, seccion): Alerta[]`, `haceCuanto(iso: string, ahora?: Date): string`.

- [ ] **Step 1: Write the failing test**

`frontend/src/modules/alertas/__tests__/logic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Alerta } from "@/api/alertas";
import { ALERTAS_READ, SEVERIDAD, filtrarAlertas, haceCuanto } from "../logic";

const base: Omit<Alerta, "clave" | "categoria" | "seccion"> = {
  regla: "T1", severidad: "critica", titulo: "t", detalle: "d",
  valor: null, umbral: null, enlace: "/",
};
const items: Alerta[] = [
  { ...base, clave: "T1:4121", categoria: "territorial", seccion: "4121" },
  { ...base, clave: "O1:4122", categoria: "operativa", seccion: "4122" },
  { ...base, clave: "O3:campaña", categoria: "operativa", seccion: null },
];

describe("filtrarAlertas", () => {
  it("sin filtros devuelve todo", () => {
    expect(filtrarAlertas(items, "todas", null)).toHaveLength(3);
  });
  it("filtra por categoría", () => {
    expect(filtrarAlertas(items, "operativa", null).map((a) => a.clave))
      .toEqual(["O1:4122", "O3:campaña"]);
    expect(filtrarAlertas(items, "territorial", null).map((a) => a.clave)).toEqual(["T1:4121"]);
  });
  it("filtra por sección y combina con categoría", () => {
    expect(filtrarAlertas(items, "todas", "4122").map((a) => a.clave)).toEqual(["O1:4122"]);
    expect(filtrarAlertas(items, "territorial", "4122")).toEqual([]);
  });
});

describe("haceCuanto", () => {
  const ahora = new Date("2026-09-27T12:00:00Z");
  it("formatea momentos, minutos y horas", () => {
    expect(haceCuanto("2026-09-27T12:00:20Z", ahora)).toBe("evaluado hace un momento");
    expect(haceCuanto("2026-09-27T11:58:00Z", ahora)).toBe("evaluado hace 2 min");
    expect(haceCuanto("2026-09-27T09:00:00+00:00", ahora)).toBe("evaluado hace 3 h");
  });
});

describe("constantes", () => {
  it("solo ejecutivos ven alertas", () => {
    expect(ALERTAS_READ).toEqual(["superadmin", "admin", "coordinador"]);
  });
  it("cada severidad tiene etiqueta y color de token", () => {
    for (const s of ["critica", "alta", "media"] as const) {
      expect(SEVERIDAD[s].label).toBeTruthy();
      expect(SEVERIDAD[s].color).toMatch(/^rgb\(var\(--c-/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/modules/alertas`
Expected: FAIL — cannot resolve `../logic` / `@/api/alertas`.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/api/alertas.ts`:

```ts
import { apiClient } from "./client";

export type Severidad = "critica" | "alta" | "media";
export type Categoria = "territorial" | "operativa";

export interface Alerta {
  clave: string;
  regla: string;
  categoria: Categoria;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  seccion: string | null;
  valor: number | null;
  umbral: number | null;
  enlace: string;
}

export interface SeccionSeveridad {
  seccion: string;
  severidad_max: Severidad | null;
}

export interface AlertasResponse {
  resumen: {
    critica: number;
    alta: number;
    media: number;
    territorial: number;
    operativa: number;
    secciones_afectadas: number;
    secciones_total: number;
  };
  secciones: SeccionSeveridad[];
  items: Alerta[];
  evaluado_en: string;
}

export async function getAlertas(): Promise<AlertasResponse> {
  return (await apiClient.get("/alertas")).data;
}
```

`frontend/src/modules/alertas/logic.ts`:

```ts
import type { Alerta, Categoria, Severidad } from "@/api/alertas";
import type { UserRole } from "@/types/auth";

/** Espejo de require_roles(ADMIN, COORDINADOR) en GET /alertas (+ superadmin). */
export const ALERTAS_READ: UserRole[] = ["superadmin", "admin", "coordinador"];

export type FiltroCategoria = "todas" | Categoria;

export const SEVERIDAD: Record<Severidad, { label: string; color: string; pill: "crit" | "warn" }> = {
  critica: { label: "Crítica", color: "rgb(var(--c-critical))", pill: "crit" },
  alta: { label: "Alta", color: "rgb(var(--c-amber))", pill: "warn" },
  media: { label: "Media", color: "rgb(var(--c-warning))", pill: "warn" },
};

export function filtrarAlertas(
  items: Alerta[],
  categoria: FiltroCategoria,
  seccion: string | null,
): Alerta[] {
  return items.filter(
    (a) =>
      (categoria === "todas" || a.categoria === categoria) &&
      (seccion === null || a.seccion === seccion),
  );
}

export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const min = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "evaluado hace un momento";
  if (min < 60) return `evaluado hace ${min} min`;
  return `evaluado hace ${Math.round(min / 60)} h`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/modules/alertas`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/alertas.ts frontend/src/modules/alertas/logic.ts frontend/src/modules/alertas/__tests__/logic.test.ts
git commit -m "feat(alertas): cliente API y lógica de filtrado (frontend)"
```

---

### Task 5: Página de Alertas + registry

**Files:**
- Create: `frontend/src/modules/alertas/SeccionGrid.tsx`
- Create: `frontend/src/modules/alertas/AlertasPage.tsx`
- Modify: `frontend/src/modules/registry.ts` (lazy imports ~line 249; entrada `riesgo` ~line 338-345)
- Test: `frontend/src/modules/alertas/__tests__/SeccionGrid.test.tsx`

**Interfaces:**
- Consumes: `getAlertas`, tipos (Task 4); `ALERTAS_READ`, `SEVERIDAD`, `filtrarAlertas`, `haceCuanto`, `FiltroCategoria` (Task 4); `useCampaignStore((s) => s.activeId)` de `@/store/campaignStore`; kit UI existente.
- Produces: `SeccionGrid({ secciones, seleccion, onSelect })` en `SeccionGrid.tsx` (sin dependencias de layout, testeable en Node) y `export default function AlertasPage()`.

- [ ] **Step 1: Write the failing test**

`frontend/src/modules/alertas/__tests__/SeccionGrid.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SeccionGrid } from "../SeccionGrid";

describe("SeccionGrid", () => {
  it("pinta una celda por sección, con color de severidad y etiqueta accesible", () => {
    const html = renderToStaticMarkup(
      <SeccionGrid
        secciones={[
          { seccion: "4121", severidad_max: "critica" },
          { seccion: "4122", severidad_max: null },
        ]}
        seleccion={null}
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("4121");
    expect(html).toContain("4122");
    expect(html).toContain("--c-critical");
    expect(html).toContain("Sección 4121: alerta crítica");
    expect(html).toContain("Sección 4122: sin alertas");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/modules/alertas`
Expected: FAIL — cannot resolve `../SeccionGrid`.

- [ ] **Step 3: Implement the grid and the page**

`frontend/src/modules/alertas/SeccionGrid.tsx`:

```tsx
import type { SeccionSeveridad } from "@/api/alertas";
import { SEVERIDAD } from "./logic";

export function SeccionGrid({
  secciones,
  seleccion,
  onSelect,
}: {
  secciones: SeccionSeveridad[];
  seleccion: string | null;
  onSelect: (seccion: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-11">
      {secciones.map((c) => {
        const sev = c.severidad_max ? SEVERIDAD[c.severidad_max] : null;
        const activa = seleccion === c.seccion;
        return (
          <button
            key={c.seccion}
            type="button"
            onClick={() => onSelect(c.seccion)}
            aria-pressed={activa}
            aria-label={`Sección ${c.seccion}: ${sev ? `alerta ${sev.label.toLowerCase()}` : "sin alertas"}`}
            className={`focus-ring rounded-lg border px-2 py-3 text-center text-sm font-semibold tabular-nums transition-colors ${
              activa ? "border-ink" : "border-line"
            }`}
            style={sev ? { background: sev.color, color: "white" } : undefined}
          >
            {c.seccion}
          </button>
        );
      })}
    </div>
  );
}
```

`frontend/src/modules/alertas/AlertasPage.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getAlertas, type Alerta } from "@/api/alertas";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StatusPill } from "@/components/ui/StatusPill";
import { useAsync } from "@/hooks/useAsync";
import { useCampaignStore } from "@/store/campaignStore";
import { SEVERIDAD, filtrarAlertas, haceCuanto, type FiltroCategoria } from "./logic";
import { SeccionGrid } from "./SeccionGrid";

const FILTROS: { key: FiltroCategoria; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "territorial", label: "Territoriales" },
  { key: "operativa", label: "Operativas" },
];

function FilaAlerta({ a }: { a: Alerta }) {
  const sev = SEVERIDAD[a.severidad];
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-l-2 border-line bg-bg-sunken px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderLeftColor: sev.color }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusPill kind={sev.pill}>{sev.label}</StatusPill>
        <span className="font-mono text-xs text-ink-faint" title={a.detalle}>{a.regla}</span>
        <span className="text-sm text-ink">{a.titulo}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-ink-muted">
        {a.valor !== null && a.umbral !== null && (
          <span className="tabular-nums">{a.valor} · umbral {a.umbral}</span>
        )}
        <Link to={a.enlace} className="font-semibold text-accent focus-ring">Ir →</Link>
      </div>
    </li>
  );
}

export default function AlertasPage() {
  const activeId = useCampaignStore((s) => s.activeId);
  const state = useAsync(() => (activeId ? getAlertas() : Promise.resolve(null)), [activeId]);
  const [categoria, setCategoria] = useState<FiltroCategoria>("todas");
  const [seccion, setSeccion] = useState<string | null>(null);
  const d = state.data;
  const visibles = useMemo(
    () => (d ? filtrarAlertas(d.items, categoria, seccion) : []),
    [d, categoria, seccion],
  );

  return (
    <AppLayout title="Alertas" crumb="Centro de riesgo">
      <PageHeader
        eyebrow="Operación · Riesgo"
        title="Alertas"
        subtitle="Riesgos territoriales y operativos de la campaña, calculados en vivo. Cada alerta lleva al módulo donde se atiende."
        actions={
          d ? (
            <button type="button" onClick={state.reload} className="btn-ghost focus-ring">
              ⟳ {haceCuanto(d.evaluado_en)}
            </button>
          ) : undefined
        }
      />

      {!activeId ? (
        <div className="card-premium p-6 text-sm text-ink-muted">
          Selecciona una campaña en la barra superior para ver sus alertas.
        </div>
      ) : (
        <DataState loading={state.loading} error={state.error} onRetry={state.reload}>
          {d && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <MetricCard label="Críticas" value={String(d.resumen.critica)} tone="critical" delay={80} />
                <MetricCard label="Altas" value={String(d.resumen.alta)} tone="warm" delay={120} />
                <MetricCard label="Medias" value={String(d.resumen.media)} tone="warning" delay={160} />
                <MetricCard label="Secciones afectadas"
                  value={`${d.resumen.secciones_afectadas}/${d.resumen.secciones_total}`}
                  tone="accent" delay={200} />
              </div>

              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
                {FILTROS.map((f) => (
                  <button key={f.key} type="button" onClick={() => setCategoria(f.key)}
                    aria-pressed={categoria === f.key}
                    className={`focus-ring rounded-pill border px-3 py-1 text-sm ${
                      categoria === f.key ? "border-ink bg-panel-hover font-semibold" : "border-line"
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>

              {d.secciones.length > 0 && (
                <section>
                  <SectionHeading eyebrow="Territorio" title="Secciones"
                    note={seccion ? `filtrando sección ${seccion} · clic de nuevo para quitar` : "clic en una sección para filtrar"} />
                  <div className="mt-4">
                    <SeccionGrid secciones={d.secciones} seleccion={seccion}
                      onSelect={(s) => setSeccion((prev) => (prev === s ? null : s))} />
                  </div>
                </section>
              )}

              <section>
                <SectionHeading eyebrow="Bandeja" title="Alertas" note={`${visibles.length} de ${d.items.length}`} />
                {visibles.length > 0 ? (
                  <ul className="mt-4 space-y-2.5">
                    {visibles.map((a) => <FilaAlerta key={a.clave} a={a} />)}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-sm text-ink-muted">
                    {d.items.length === 0 ? "Sin alertas: todo en verde." : "Ninguna alerta con este filtro."}
                  </p>
                )}
              </section>
            </div>
          )}
        </DataState>
      )}
    </AppLayout>
  );
}
```

Modify `frontend/src/modules/registry.ts`:

1. Add the import at the top (with the other `@/` imports):
```ts
import { ALERTAS_READ } from "@/modules/alertas/logic";
```
2. Next to the `WarRoom` lazy import (~line 249) add:
```ts
const Alertas = lazy(() =>
  import("@/modules/alertas/AlertasPage"),
);
```
3. Replace the whole `riesgo` entry (the multi-line object with `state: "soon"` and its `soon: {…}` block) with:
```ts
  { key: "riesgo", path: "/riesgo", label: "Alertas", section: "operacion", icon: AlertIcon, state: "active", element: Alertas, roles: ALERTAS_READ },
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && npx vitest run src/modules/alertas && npm run build`
Expected: 7 tests pass; build completes with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/alertas/SeccionGrid.tsx frontend/src/modules/alertas/AlertasPage.tsx frontend/src/modules/alertas/__tests__/SeccionGrid.test.tsx frontend/src/modules/registry.ts
git commit -m "feat(alertas): página /riesgo (KPIs, filtro, cuadrícula, bandeja) y registry activo"
```

---

### Task 6: Chip de alertas críticas en Inicio + verificación final

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx` (imports lines 1-28; `PageHeader` `actions` ~line 123)

**Interfaces:**
- Consumes: `getAlertas` (Task 4), `ALERTAS_READ` (Task 4), `useAuthStore` de `@/store/authStore`, `StatusPill` (ya importado en el archivo).
- Produces: chip "N alertas críticas" → `/riesgo`, solo para roles de `ALERTAS_READ` y solo si N > 0.

- [ ] **Step 1: Implement**

Add imports to `frontend/src/pages/DashboardPage.tsx`:

```ts
import { getAlertas } from "@/api/alertas";
import { ALERTAS_READ } from "@/modules/alertas/logic";
import { useAuthStore } from "@/store/authStore";
```

Inside `DashboardPage()`, right after the existing `useAsync<ExecutiveDashboard>(…)` call:

```ts
  const role = useAuthStore((s) => s.user?.role);
  const puedeAlertas = !!role && ALERTAS_READ.includes(role);
  // Falla silenciosa: el chip es un atajo, nunca debe romper Inicio.
  const centro = useAsync(
    () => (puedeAlertas ? getAlertas().catch(() => null) : Promise.resolve(null)),
    [puedeAlertas],
  );
  const criticas = centro.data?.resumen.critica ?? 0;
```

Replace the `PageHeader` `actions` prop:

```tsx
        actions={
          <div className="flex items-center gap-3">
            {criticas > 0 && (
              <Link to="/riesgo" className="focus-ring" aria-label={`Ver ${criticas} alertas críticas`}>
                <StatusPill kind="crit">
                  {criticas} {criticas === 1 ? "alerta crítica" : "alertas críticas"}
                </StatusPill>
              </Link>
            )}
            <CountdownElectoral date={data?.election_date ?? null} />
          </div>
        }
```

- [ ] **Step 2: Type-check and run all frontend tests**

Run: `cd frontend && npm run build && npm run test`
Expected: build OK; all Vitest suites pass.

- [ ] **Step 3: Run the full backend suite**

Run: `cd backend && python3 -m pytest -q`
Expected: all pass.

- [ ] **Step 4: Manual smoke (dev)**

Run backend + `cd frontend && npm run dev`; log in as a coordinador with a campaign selected; open `/riesgo`: KPIs render, clicking a sección filters the list and clicking again clears it, category filter works, "Ir →" navigates. Switch to "Todas las bases (consolidado)" as superadmin: the page shows "Selecciona una campaña…" and no 400 appears. On Inicio, the red chip appears only when there are critical alerts.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat(alertas): chip de alertas críticas en Inicio"
```
