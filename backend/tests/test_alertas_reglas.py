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
