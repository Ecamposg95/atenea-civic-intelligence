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
