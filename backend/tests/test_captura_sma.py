"""Captura de hojas SMA — /captura/* (spec 2026-11-17 §4–§5)."""
import json
import uuid

import pytest
from sqlalchemy import delete, func, select

from app.core import crypto
from app.models.audit_log import AuditLog
from app.models.privacy import PrivacyAcceptance
from app.models.registro import Registro
from app.models.user import User
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal, auth_headers

_N = 0


def _clave() -> str:
    """Fresh valid clave (18 alnum)."""
    global _N
    _N += 1
    return f"TESTCL{_N:06d}H{uuid.uuid4().hex[:5].upper()}"[:18].ljust(18, "X")


def _curp(n: int) -> str:
    return f"GOMC80010{n % 10}HDFRRR0{n % 10}"


def _persona(nombre="JUAN", paterno="PEREZ", materno="LOPEZ", seccion="4121",
             clave=None, telefono="7221234567", curp=None, **kw):
    d = {"apellido_paterno": paterno, "apellido_materno": materno, "nombres": nombre,
         "seccion": seccion, "calle": "HIDALGO", "numero": "12", "colonia": "SAN PEDRO",
         "clave_elector": clave if clave is not None else _clave(), "telefono": telefono}
    if curp:
        d["curp"] = curp
    d.update(kw)
    return d


def _h(client, email="capturista@alpha.gov"):
    h = auth_headers(client, email)
    h["X-Campaign-Id"] = ALPHA_CAMPAIGN_ID
    return h


def _purge():
    db = TestingSessionLocal()
    try:
        ids = [i for (i,) in db.execute(
            select(Registro.id).where((Registro.tipo.is_not(None)) | (Registro.legacy.is_(True)))
        ).all()]
        if ids:
            db.execute(delete(PrivacyAcceptance).where(PrivacyAcceptance.registro_id.in_(ids)))
            db.execute(delete(Registro).where(Registro.id.in_(ids)))
        db.execute(delete(AuditLog).where(AuditLog.action == "captura.hoja"))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clean():
    _purge()
    yield
    _purge()


def _count_tipo():
    db = TestingSessionLocal()
    try:
        return db.execute(select(func.count()).select_from(Registro)
                          .where(Registro.tipo.is_not(None))).scalar_one()
    finally:
        db.close()


def _hoja(client, body, email="capturista@alpha.gov"):
    return client.post("/api/captura/hoja", json=body, headers=_h(client, email))


def _crear_lider(client, n_activistas=2, **lider_kw):
    body = {"tipo_hoja": "LIDER", "dry_run": False,
            "titular": _persona(nombre="ROSA", paterno="LIDER", **lider_kw),
            "filas": [_persona(nombre=f"ACT{i}", paterno="ACTIVO") for i in range(n_activistas)]}
    r = _hoja(client, body)
    assert r.status_code == 200, r.text
    return r.json()


# ── catálogo ────────────────────────────────────────────────────────────────

def test_catalogo(client):
    r = client.get("/api/captura/catalogo", headers=_h(client))
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["secciones"]) == 22
    s = {x["seccion"]: x for x in body["secciones"]}
    assert s["6673"]["region"] == "R-4" and s["6673"]["barrio"] == "SAN PEDRO"
    assert "SAN PEDRO" in body["barrios"]


# ── dry run ─────────────────────────────────────────────────────────────────

def test_dry_run_no_escribe(client):
    body = {"tipo_hoja": "LIDER", "dry_run": True, "titular": _persona(),
            "filas": [_persona(nombre="ANA"), {}, _persona(nombre="LUIS")]}
    r = _hoja(client, body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["ok"] is True and out["creados"] == 0 and out["hoja_id"] is None
    assert [f["index"] for f in out["filas"]] == [0, 2]  # empty row ignored
    # no CURP → aviso only
    assert out["titular"]["estado"] == "aviso"
    assert _count_tipo() == 0


# ── LIDER sheet ─────────────────────────────────────────────────────────────

def test_hoja_lider_crea_lider_y_activistas(client):
    out = _crear_lider(client, n_activistas=3, curp=_curp(1))
    assert out["ok"] is True and out["creados"] == 4 and out["hoja_id"]
    lider_id = out["titular"]["id"]
    db = TestingSessionLocal()
    try:
        lider = db.get(Registro, lider_id)
        assert lider.tipo == "LIDER" and lider.padre_id is None and lider.legacy is False
        assert lider.nombre_completo == "ROSA LIDER LOPEZ"
        assert lider.aviso_version == "papel-2027" and lider.consentimiento is True
        assert lider.clave_hash and lider.clave_elector_enc and lider.clave_masked.startswith("****-")
        assert lider.curp_hash and lider.curp_masked == "****-RR01"
        assert crypto.decrypt_curp(lider.curp_enc) == _curp(1)
        acts = db.execute(select(Registro).where(Registro.padre_id == lider_id)).scalars().all()
        assert len(acts) == 3
        assert all(a.tipo == "ACTIVISTA" and a.hoja_id == out["hoja_id"] for a in acts)
        assert all(a.promotor == "ROSA LIDER LOPEZ" for a in acts)
        cap = db.execute(select(User).where(User.email == "capturista@alpha.gov")).scalar_one()
        assert all(a.activista_id == cap.id for a in acts)
        acc = db.execute(select(func.count()).select_from(PrivacyAcceptance)
                         .where(PrivacyAcceptance.registro_id.in_([lider_id] + [a.id for a in acts]))).scalar_one()
        assert acc == 4
    finally:
        db.close()


def test_hoja_lider_con_titular_existente(client):
    out = _crear_lider(client, n_activistas=1)
    lider_id = out["titular"]["id"]
    r = _hoja(client, {"tipo_hoja": "LIDER", "dry_run": False, "titular": {"id": lider_id},
                       "filas": [_persona(nombre="OTRO")]})
    assert r.status_code == 200, r.text
    assert r.json()["creados"] == 1 and r.json()["titular"]["id"] == lider_id


# ── FAMILIA sheet ───────────────────────────────────────────────────────────

def test_hoja_familia_con_activista_existente(client):
    out = _crear_lider(client, n_activistas=1)
    act_id = out["filas"][0]["id"]
    r = _hoja(client, {"tipo_hoja": "FAMILIA", "dry_run": False, "titular": {"id": act_id},
                       "filas": [_persona(nombre=f"PROM{i}") for i in range(7)]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["creados"] == 7
    db = TestingSessionLocal()
    try:
        proms = db.execute(select(Registro).where(Registro.padre_id == act_id)).scalars().all()
        assert len(proms) == 7 and all(p.tipo == "PROMOVIDO" for p in proms)
        assert all(p.promotor == "ROSA LIDER LOPEZ" for p in proms)  # líder name
    finally:
        db.close()


def test_hoja_familia_titular_nuevo_requiere_lider(client):
    out = _crear_lider(client, n_activistas=0)
    lider_id = out["titular"]["id"]
    sin = _hoja(client, {"tipo_hoja": "FAMILIA", "dry_run": True,
                         "titular": _persona(nombre="ACT"), "filas": []}).json()
    assert sin["titular"]["estado"] == "error"
    r = _hoja(client, {"tipo_hoja": "FAMILIA", "dry_run": False,
                       "titular": {**_persona(nombre="ACT"), "padre_id": lider_id},
                       "filas": [_persona(nombre="P1")]})
    assert r.status_code == 200, r.text
    db = TestingSessionLocal()
    try:
        act = db.get(Registro, r.json()["titular"]["id"])
        assert act.tipo == "ACTIVISTA" and act.padre_id == lider_id
    finally:
        db.close()


def test_familia_max_7_filas(client):
    out = _crear_lider(client, n_activistas=1)
    r = _hoja(client, {"tipo_hoja": "FAMILIA", "dry_run": True,
                       "titular": {"id": out["filas"][0]["id"]},
                       "filas": [_persona(nombre=f"P{i}") for i in range(8)]})
    assert r.status_code == 422


# ── validation ──────────────────────────────────────────────────────────────

def test_errores_y_422_sin_escribir(client):
    filas = [
        _persona(seccion="9999"),                 # sección fuera de SMA
        _persona(clave="ABC123"),                 # clave corta
        _persona(telefono="12345"),               # teléfono corto
        _persona(clave=""),                       # falta clave → error
        _persona(curp="NOESUNACURPVALIDA1"),      # curp inválida
        _persona(paterno="", nombre=""),          # faltan nombre/apellido
        _persona(nombre="BUENO"),
    ]
    body = {"tipo_hoja": "LIDER", "dry_run": False, "titular": _persona(), "filas": filas}
    r = _hoja(client, body)
    assert r.status_code == 422
    out = r.json()
    assert out["ok"] is False and out["creados"] == 0 and out["hoja_id"] is None
    est = [f["estado"] for f in out["filas"]]
    assert est[:6] == ["error"] * 6 and est[6] in ("ok", "aviso")
    msgs = json.dumps(out, ensure_ascii=False)
    assert "sección" in msgs and "teléfono" in msgs and "CURP" in msgs
    assert _count_tipo() == 0
    # clave never echoed
    for f in filas:
        if f["clave_elector"] and len(f["clave_elector"]) == 18:
            assert f["clave_elector"] not in r.text


def test_clave_duplicada_en_hoja_y_vs_nuevos(client):
    c = _clave()
    r = _hoja(client, {"tipo_hoja": "LIDER", "dry_run": True, "titular": _persona(clave=c),
                       "filas": [_persona(nombre="X", clave=c.lower())]})
    out = r.json()
    assert out["titular"]["estado"] == "error" and out["filas"][0]["estado"] == "error"
    assert c not in r.text

    _crear_lider(client, n_activistas=0, clave=c)
    r2 = _hoja(client, {"tipo_hoja": "LIDER", "dry_run": True,
                        "titular": _persona(nombre="NUEVO", clave=c), "filas": []}).json()
    assert r2["titular"]["estado"] == "error"
    assert any("ya fue capturada" in m for m in r2["titular"]["mensajes"])


def test_curp_duplicada(client):
    cu = _curp(3)
    r = _hoja(client, {"tipo_hoja": "LIDER", "dry_run": True,
                       "titular": _persona(curp=cu), "filas": [_persona(nombre="Y", curp=cu)]}).json()
    assert r["titular"]["estado"] == "error"
    _crear_lider(client, n_activistas=0, curp=cu)
    r2 = _hoja(client, {"tipo_hoja": "LIDER", "dry_run": True,
                        "titular": _persona(nombre="OTRA", curp=cu), "filas": []}).json()
    assert any("CURP ya fue capturada" in m for m in r2["titular"]["mensajes"])


def test_coincidencia_valor_viejo_es_aviso(client):
    c = _clave()
    db = TestingSessionLocal()
    try:
        cap = db.execute(select(User).where(User.email == "capturista@alpha.gov")).scalar_one()
        db.add(Registro(organization_id=cap.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                        nombre_completo="VIEJO PEREZ LOPEZ", seccion="4121", consentimiento=True,
                        legacy=True, clave_hash=crypto.hash_clave(c)))
        db.commit()
    finally:
        db.close()
    r = _hoja(client, {"tipo_hoja": "LIDER", "dry_run": False,
                       "titular": _persona(nombre="VIEJO", clave=c, curp=_curp(5)), "filas": []})
    assert r.status_code == 200, r.text
    t = r.json()["titular"]
    assert t["estado"] == "aviso" and any("valor viejo" in m for m in t["mensajes"])
    assert r.json()["creados"] == 1


# ── roles ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("email,code", [
    ("capturista@alpha.gov", 200), ("coord@alpha.gov", 200), ("admin@alpha.gov", 200),
    ("activista1@alpha.gov", 403), ("lider@alpha.gov", 403),
])
def test_roles(client, email, code):
    r = client.get("/api/captura/catalogo", headers=_h(client, email))
    assert r.status_code == code
    r = _hoja(client, {"tipo_hoja": "LIDER", "dry_run": True, "titular": _persona(), "filas": []},
              email=email)
    assert r.status_code == code


# ── personas / mis-hojas / audit ────────────────────────────────────────────

def test_personas_busqueda(client):
    out = _crear_lider(client, n_activistas=2)
    r = client.get("/api/captura/personas", params={"tipo": "LIDER", "q": "rosa"}, headers=_h(client))
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 1 and items[0]["id"] == out["titular"]["id"] and items[0]["hijos"] == 2
    acts = client.get("/api/captura/personas", params={"tipo": "ACTIVISTA"}, headers=_h(client)).json()
    assert len(acts) == 2 and all(a["padre_nombre"] == "ROSA LIDER LOPEZ" for a in acts)
    assert "clave_elector" not in r.text
    bad = client.get("/api/captura/personas", params={"tipo": "PROMOVIDO"}, headers=_h(client))
    assert bad.status_code == 422


def test_mis_hojas_y_audit_sin_clave(client):
    c = _clave()
    out = _crear_lider(client, n_activistas=2, clave=c, curp=_curp(7))
    r = client.get("/api/captura/mis-hojas", headers=_h(client))
    assert r.status_code == 200, r.text
    hojas = r.json()
    assert hojas[0]["hoja_id"] == out["hoja_id"]
    assert hojas[0]["tipo_hoja"] == "LIDER" and hojas[0]["filas"] == 2
    assert hojas[0]["titular_nombre"] == "ROSA LIDER LOPEZ" and hojas[0]["titular_nuevo"] is True
    # another user doesn't see it
    assert client.get("/api/captura/mis-hojas", headers=_h(client, "coord@alpha.gov")).json() == []

    db = TestingSessionLocal()
    try:
        rows = db.execute(select(AuditLog).where(AuditLog.action == "captura.hoja")).scalars().all()
        assert len(rows) == 1
        blob = json.dumps(rows[0].meta)
        assert rows[0].meta["creados"] == 3
        assert c not in blob and _curp(7) not in blob and "ROSA" not in blob
    finally:
        db.close()


def test_registro_read_y_promovidos_exponen_legacy_tipo_padre(client):
    out = _crear_lider(client, n_activistas=1)
    act_id = out["filas"][0]["id"]
    r = client.get(f"/api/registros/{act_id}", headers=_h(client, "admin@alpha.gov"))
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["legacy"] is False and b["tipo"] == "ACTIVISTA" and b["padre_nombre"] == "ROSA LIDER LOPEZ"
    assert "curp_masked" in b

    db = TestingSessionLocal()
    try:
        cap = db.execute(select(User).where(User.email == "capturista@alpha.gov")).scalar_one()
        db.add(Registro(organization_id=cap.organization_id, campaign_id=ALPHA_CAMPAIGN_ID,
                        nombre_completo="VIEJITO", seccion="4121", consentimiento=True, legacy=True))
        db.commit()
    finally:
        db.close()
    h = _h(client, "admin@alpha.gov")
    viejos = client.get("/api/promovidos", params={"legacy": "viejos", "limit": 200}, headers=h).json()
    assert viejos["items"] and all(i["legacy"] for i in viejos["items"])
    nuevos = client.get("/api/promovidos", params={"legacy": "nuevos", "limit": 200}, headers=h).json()
    assert all(not i["legacy"] for i in nuevos["items"])
    row = next(i for i in nuevos["items"] if i["id"] == act_id)
    assert row["tipo"] == "ACTIVISTA" and row["padre_nombre"] == "ROSA LIDER LOPEZ"
    assert client.get("/api/promovidos", params={"legacy": "x"}, headers=h).status_code == 422


def test_reveal_incluye_curp(client):
    out = _crear_lider(client, n_activistas=0, curp=_curp(8))
    rid = out["titular"]["id"]
    r = client.post(f"/api/admin/registros/{rid}/revelar-clave", headers=_h(client, "admin@alpha.gov"))
    assert r.status_code == 200, r.text
    assert r.json()["curp"] == _curp(8)
    db = TestingSessionLocal()
    try:
        n = db.execute(select(func.count()).select_from(AuditLog).where(
            AuditLog.action == "registro.reveal_curp", AuditLog.entity_id == rid)).scalar_one()
        assert n == 1
    finally:
        db.close()
