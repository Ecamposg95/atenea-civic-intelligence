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
# IEEM numera ID_MUNICIPIO alfabéticamente (no coincide con la clave INEGI, salvo 15013).
# clave INEGI -> ID_MUNICIPIO de IEEM (estable en 2018/2021/2024).
IEEM_ID = {"15013": 13, "15104": 105, "15057": 58, "15060": 61, "15121": 25, "15038": 39, "15046": 47}
IEEM = {
    2024: "https://www.ieem.org.mx/assets/docs/procesos-electorales/resultados/2024/Ayuntamientos/Resultados_definitivos_ayu_seccion.xlsx",
    2021: "https://www.ieem.org.mx/assets/docs/procesos-electorales/resultados/2021/RESULTADOS%20DEFINITIVOS%20INTEGRANTES%20DE%20LOS%20AYUNTAMIENTOS/RESULTADOS%20POR%20SECCION%20ELECION%20AYUNTAMIENTOS%202021.xlsx",
    2018: "https://www.ieem.org.mx/assets/docs/procesos-electorales/resultados/2018/2018_SEE_AYUN_MEX_SEC.xlsx",
}
ITER_URL = "https://www.inegi.org.mx/contenidos/programas/ccpv/2020/datosabiertos/iter/iter_15_cpv2020_csv.zip"


def fetch(url: str, cache: Path) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    dest = cache / (hashlib.sha1(url.encode()).hexdigest()[:12] + Path(url.split("?")[0]).suffix)  # openpyxl exige extensión
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
        if code not in IEEM_ID:
            ap.error(f"municipio {code} sin mapeo a ID_MUNICIPIO de IEEM (agrégalo a IEEM_ID)")
        ieem_code = f"15{IEEM_ID[code]:03d}"  # filas_municipio espera '15' + ID_MUNICIPIO IEEM
        header24, rows24 = hojas[2024]
        atz24 = b.filas_municipio(rows24, ieem_code)
        secs = b.secciones_2024(atz24, header24)
        intel: list[tuple] = []
        omitidos: list[str] = []
        for anio in (2018, 2021, 2024):
            header, rows = hojas[anio]
            try:
                intel += b.intel_electoral(anio, b.filas_municipio(rows, ieem_code), header)
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
