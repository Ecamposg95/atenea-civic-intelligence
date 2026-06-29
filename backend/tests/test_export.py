"""TDD tests for registros export endpoint (SPA-4 Task 7).

Covers:
- CSV + XLSX return correct content-type, Content-Disposition, and scoped rows
- LIDER scope: only their estructura registros appear
- ACTIVISTA is blocked at the gate (403)
- Clave is MASKED by default (no plaintext in output)
- reveal=true as LIDER → 403
- reveal=true as ADMIN → plaintext clave in output + audit record (no PII in meta)
- Cross-tenant: alpha admin cannot see beta registros in export
- Default export emits registro.export audit
"""
from __future__ import annotations

import csv
import io

import openpyxl
import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.registro import Registro
from tests.conftest import (
    ALPHA_CAMPAIGN_ID,
    BETA_CAMPAIGN_ID,
    TestingSessionLocal,
    auth_headers,
)


@pytest.fixture(autouse=True)
def cleanup_registros():
    """Delete all registros after each test to prevent contamination."""
    yield
    db = TestingSessionLocal()
    try:
        db.query(Registro).delete()
        db.query(AuditLog).filter(
            AuditLog.action.in_(["registro.export", "registro.export.reveal"])
        ).delete()
        db.commit()
    finally:
        db.close()


def _hdr(client, email, campaign_id=None):
    h = auth_headers(client, email)
    if campaign_id:
        h["X-Campaign-Id"] = campaign_id
    return h


def _capture(client, email, campaign_id=ALPHA_CAMPAIGN_ID, **body):
    h = _hdr(client, email, campaign_id)
    r = client.post("/api/registros", json={"consentimiento": True, **body}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _csv_rows(resp) -> list[dict]:
    return list(csv.DictReader(io.StringIO(resp.text)))


def _xlsx_rows(resp) -> tuple[list, list[list]]:
    """Returns (header_row, data_rows) with all cell values as strings."""
    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    ws = wb.active
    all_rows = list(ws.iter_rows(values_only=True))
    header = list(all_rows[0]) if all_rows else []
    data = [list(r) for r in all_rows[1:]] if len(all_rows) > 1 else []
    return header, data


# ---------------------------------------------------------------------------
# CSV export basics
# ---------------------------------------------------------------------------


def test_csv_export_content_type_and_rows(client):
    """Admin CSV export returns text/csv with the right number of rows."""
    _capture(client, "activista1@alpha.gov", nombre_completo="Persona A", seccion="0001")
    _capture(client, "activista2@alpha.gov", nombre_completo="Persona B", seccion="0002")

    resp = client.get(
        "/api/registros/export?format=csv",
        headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID),
    )
    assert resp.status_code == 200, resp.text
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers.get("content-disposition", "")
    assert ".csv" in resp.headers.get("content-disposition", "")

    rows = _csv_rows(resp)
    assert len(rows) == 2
    nombres = {r["nombre_completo"] for r in rows}
    assert nombres == {"Persona A", "Persona B"}


# ---------------------------------------------------------------------------
# XLSX export basics
# ---------------------------------------------------------------------------


def test_xlsx_export_content_type_and_rows(client):
    """Admin XLSX export returns spreadsheetml content-type and is openpyxl-readable."""
    _capture(client, "activista1@alpha.gov", nombre_completo="Excel Persona")

    resp = client.get(
        "/api/registros/export?format=xlsx",
        headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID),
    )
    assert resp.status_code == 200, resp.text
    assert "spreadsheetml" in resp.headers["content-type"]
    assert "attachment" in resp.headers.get("content-disposition", "")
    assert ".xlsx" in resp.headers.get("content-disposition", "")

    header, data = _xlsx_rows(resp)
    assert "nombre_completo" in header
    nc_idx = header.index("nombre_completo")
    data_names = [row[nc_idx] for row in data]
    assert "Excel Persona" in data_names


# ---------------------------------------------------------------------------
# Scope: lider sees only their estructura
# ---------------------------------------------------------------------------


def test_lider_scope_only_sees_their_estructura(client):
    """Lider export only includes registros from their activistas + own captures."""
    _capture(client, "activista1@alpha.gov", nombre_completo="Lider Activista P")
    # Beta activista in different org — must be invisible to alpha lider
    _capture(
        client,
        "activista_beta@beta.gov",
        nombre_completo="Beta P",
        campaign_id=BETA_CAMPAIGN_ID,
    )

    resp = client.get(
        "/api/registros/export?format=csv",
        headers=_hdr(client, "lider@alpha.gov", ALPHA_CAMPAIGN_ID),
    )
    assert resp.status_code == 200, resp.text

    rows = _csv_rows(resp)
    nombres = [r["nombre_completo"] for r in rows]
    assert "Lider Activista P" in nombres
    assert "Beta P" not in nombres


# ---------------------------------------------------------------------------
# ACTIVISTA blocked at gate
# ---------------------------------------------------------------------------


def test_activista_forbidden_from_export(client):
    """ACTIVISTA role is blocked at the export gate (require_roles ADMIN+LIDER)."""
    resp = client.get(
        "/api/registros/export?format=csv",
        headers=_hdr(client, "activista1@alpha.gov", ALPHA_CAMPAIGN_ID),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Masking by default
# ---------------------------------------------------------------------------


def test_clave_masked_by_default_in_csv(client):
    """Default CSV export: clave column is masked (****-XXXX), not plaintext."""
    _capture(
        client,
        "activista1@alpha.gov",
        nombre_completo="Clave Test",
        clave_elector="ABCD1234567890XYZ8",
    )

    resp = client.get(
        "/api/registros/export?format=csv",
        headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID),
    )
    assert resp.status_code == 200, resp.text

    rows = _csv_rows(resp)
    assert len(rows) == 1
    clave_val = rows[0]["clave"]
    assert clave_val.startswith("****-"), f"Expected masked clave, got: {clave_val}"
    assert "ABCD1234567890XYZ8" not in resp.text


def test_clave_masked_by_default_in_xlsx(client):
    """Default XLSX export: clave column is masked, no plaintext clave anywhere."""
    _capture(
        client,
        "activista1@alpha.gov",
        nombre_completo="XLSX Mask Test",
        clave_elector="ABCD1234567890XYZ8",
    )

    resp = client.get(
        "/api/registros/export?format=xlsx",
        headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID),
    )
    assert resp.status_code == 200, resp.text

    header, data = _xlsx_rows(resp)
    all_values = [str(cell or "") for row in data for cell in row]
    assert "ABCD1234567890XYZ8" not in all_values
    assert any(v.startswith("****-") for v in all_values), "Expected a masked clave in XLSX"


# ---------------------------------------------------------------------------
# reveal=true RBAC
# ---------------------------------------------------------------------------


def test_reveal_lider_forbidden(client):
    """LIDER cannot use reveal=true; must receive 403."""
    _capture(
        client,
        "activista1@alpha.gov",
        nombre_completo="Rev Lider",
        clave_elector="ABCD1234567890XYZ8",
    )

    resp = client.get(
        "/api/registros/export?format=csv&reveal=true",
        headers=_hdr(client, "lider@alpha.gov", ALPHA_CAMPAIGN_ID),
    )
    assert resp.status_code == 403


def test_reveal_admin_plaintext_and_audited(client):
    """ADMIN with reveal=true gets plaintext clave and a registro.export.reveal audit."""
    _capture(
        client,
        "activista1@alpha.gov",
        nombre_completo="Rev Admin",
        clave_elector="ABCD1234567890XYZ8",
    )

    resp = client.get(
        "/api/registros/export?format=csv&reveal=true",
        headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID),
    )
    assert resp.status_code == 200, resp.text

    rows = _csv_rows(resp)
    assert len(rows) == 1
    assert rows[0]["clave"] == "ABCD1234567890XYZ8", (
        f"Expected plaintext clave, got: {rows[0]['clave']}"
    )

    # Verify audit was written with action registro.export.reveal
    db = TestingSessionLocal()
    try:
        audits = db.execute(
            select(AuditLog).where(AuditLog.action == "registro.export.reveal")
        ).scalars().all()
        assert len(audits) >= 1, "Expected at least one registro.export.reveal audit entry"
        # Golden Rule #5: meta must not contain PII (no raw clave values)
        for audit in audits:
            meta_str = str(audit.meta or "")
            assert "ABCD1234567890XYZ8" not in meta_str, (
                "Plaintext clave must never appear in audit meta"
            )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Cross-tenant isolation
# ---------------------------------------------------------------------------


def test_cross_tenant_registros_absent(client):
    """Alpha admin export must not contain beta org's registros."""
    _capture(client, "activista1@alpha.gov", nombre_completo="Alpha Person")
    _capture(
        client,
        "activista_beta@beta.gov",
        nombre_completo="Beta Person",
        campaign_id=BETA_CAMPAIGN_ID,
    )

    resp = client.get(
        "/api/registros/export?format=csv",
        headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID),
    )
    assert resp.status_code == 200, resp.text

    names = [r["nombre_completo"] for r in _csv_rows(resp)]
    assert "Alpha Person" in names
    assert "Beta Person" not in names, "Cross-tenant leak: Beta Person must not appear"


# ---------------------------------------------------------------------------
# Default export emits audit
# ---------------------------------------------------------------------------


def test_default_export_emits_audit(client):
    """A plain (no reveal) export writes a registro.export audit entry."""
    _capture(client, "activista1@alpha.gov", nombre_completo="Audit Base Test")

    resp = client.get(
        "/api/registros/export?format=csv",
        headers=_hdr(client, "admin@alpha.gov", ALPHA_CAMPAIGN_ID),
    )
    assert resp.status_code == 200

    db = TestingSessionLocal()
    try:
        audits = db.execute(
            select(AuditLog).where(AuditLog.action == "registro.export")
        ).scalars().all()
        assert len(audits) >= 1, "Expected at least one registro.export audit entry"
    finally:
        db.close()
