"""Militante service tests — create/crypto/flags/consent, scoping, validate,
reveal, document upload, panorama. Fixtures live in conftest.py."""
import pytest

from app.services import militante_service
from app.schemas.militante import MilitanteCreate


# ── Task 4: create (crypto, folio, quality flags, consent, audit) ─────────────
def test_create_militante_encrypts_and_flags(activista_ctx, db_session):
    data = MilitanteCreate(nombre_completo="Ana López", consentimiento=True,
                           curp="LOPA900101MMCXXX01", clave_elector="LOPXAN90010115M100",
                           seccion="4127")
    m = militante_service.create_militante(db_session, activista_ctx, data)
    assert m.folio.startswith("SMA-")
    assert m.estado == "REGISTRADO"
    assert m.curp_masked and m.curp_masked != "LOPA900101MMCXXX01"
    assert m.curp_enc is not None
    assert m.quality_flags["falta_foto_frente"] is True
    assert m.quality_flags["falta_curp"] is False


def test_create_militante_requires_consent(activista_ctx, db_session):
    # nombre "Xx" (>=2 chars) passes schema validation so the service-level
    # ConsentRequired is what actually triggers (brief used "X" which trips the
    # min_length=2 schema rule before reaching the service).
    data = MilitanteCreate(nombre_completo="Xx", consentimiento=False)
    with pytest.raises(militante_service.ConsentRequired):
        militante_service.create_militante(db_session, activista_ctx, data)


# ── Task 5: role-scoped list + get ────────────────────────────────────────────
def test_list_scoped_by_activista(activista_ctx, otro_activista_ctx, db_session):
    militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Mía", consentimiento=True, seccion="4127"))
    militante_service.create_militante(db_session, otro_activista_ctx,
        MilitanteCreate(nombre_completo="Ajena", consentimiento=True, seccion="4127"))
    rows, total, _ = militante_service.list_militantes(
        db_session, activista_ctx, seccion=None, estado=None, activista=None,
        flag=None, q=None, limit=50, offset=0)
    assert total == 1
    assert rows[0].nombre_completo == "Mía"


# ── I-3: quality-flag filter must be consistent with total + paging ───────────
def test_list_flag_filter_total_and_paging(activista_ctx, db_session):
    # two militantes without CURP (falta_curp True), one with CURP (falta_curp False)
    militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Sin1", consentimiento=True, seccion="4127"))
    militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Sin2", consentimiento=True, seccion="4127"))
    militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Con", consentimiento=True,
                        curp="LOPA900101MMCXXX01", seccion="4127"))
    rows, total, _ = militante_service.list_militantes(
        db_session, activista_ctx, seccion=None, estado=None, activista=None,
        flag="falta_curp", q=None, limit=50, offset=0)
    assert total == 2  # count reflects the flag filter, not the unfiltered set
    assert all((r.quality_flags or {}).get("falta_curp") for r in rows)
    assert {r.nombre_completo for r in rows} == {"Sin1", "Sin2"}


# ── I-2: folio derives from MAX suffix → no reuse after soft-delete ───────────
def test_folio_not_reused_after_soft_delete(activista_ctx, db_session):
    from datetime import datetime, timezone
    m1 = militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Uno", consentimiento=True, seccion="4127"))
    m1.deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    m2 = militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Dos", consentimiento=True, seccion="4127"))
    assert m1.folio != m2.folio  # deleted folio not reused


# ── Task 6: validate (estado) + reveal (PII) ──────────────────────────────────
from app.schemas.militante import MilitanteEstadoUpdate


# ── I-1: territory gate applies to get/reveal/set_estado, not just list ───────
def test_coordinador_sees_militante_across_territory(coordinador_ctx, activista_ctx, db_session):
    # COORDINADOR is campaign-wide (no territory gate) → gets / reveals / validates
    # a militante even in a sección outside their own area (9999).
    m = militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Fuera", consentimiento=True,
                        curp="LOPA900101MMCXXX01", clave_elector="LOPXAN90010115M100",
                        seccion="9999"))
    assert militante_service.get_militante(db_session, coordinador_ctx, m.id) is not None
    assert militante_service.reveal_militante(db_session, coordinador_ctx, m.id) is not None
    out = militante_service.set_estado(db_session, coordinador_ctx, m.id,
        MilitanteEstadoUpdate(estado="VALIDADO"))
    assert out is not None and out.estado == "VALIDADO"


def test_set_estado_validado_audits(coordinador_ctx, activista_ctx, db_session):
    m = militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Val", consentimiento=True, seccion="4127"))
    out = militante_service.set_estado(db_session, coordinador_ctx, m.id,
        MilitanteEstadoUpdate(estado="VALIDADO"))
    assert out.estado == "VALIDADO"
    assert out.validado_por == coordinador_ctx.user.id


# ── Task 7: document upload ───────────────────────────────────────────────────
def test_upload_documento_sets_key_and_clears_flag(activista_ctx, db_session, monkeypatch):
    import app.core.storage as storage
    monkeypatch.setattr(storage, "put_object", lambda *a, **k: None)
    m = militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Doc", consentimiento=True, seccion="4127"))
    out = militante_service.upload_documento(db_session, activista_ctx, m.id, "frente", b"jpg", "image/jpeg")
    assert out.credencial_frente_key.endswith("/frente.jpg")
    assert out.quality_flags["falta_foto_frente"] is False


# ── Task 8: panorama aggregation ──────────────────────────────────────────────
def test_panorama_counts(coordinador_ctx, activista_ctx, db_session):
    for i in range(3):
        militante_service.create_militante(db_session, activista_ctx,
            MilitanteCreate(nombre_completo=f"P{i}", consentimiento=True, seccion="4127"))
    pan = militante_service.panorama(db_session, coordinador_ctx)
    assert pan["kpis"]["total"] == 3
    assert any(s["seccion"] == "4127" and s["militantes"] == 3 for s in pan["por_seccion"])
