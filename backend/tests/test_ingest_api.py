import io
from tests.conftest import auth_headers, ALPHA_CAMPAIGN_ID

CSV = b"nivel,clave,indicador,valor\nmunicipio,15001,POBTOT,57862\n"


def test_upload_census_and_list_runs(client):
    h = {**auth_headers(client, "admin@alpha.gov"), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}
    r = client.post("/api/ingest/census?anio=2020", headers=h,
                    files={"file": ("c.csv", io.BytesIO(CSV), "text/csv")})
    assert r.status_code == 201, r.text
    assert r.json()["rows_inserted"] == 1
    runs = client.get("/api/ingest/runs", headers=h)
    assert runs.status_code == 200 and len(runs.json()) >= 1


def test_datasets_endpoint(client):
    h = auth_headers(client, "admin@alpha.gov")
    r = client.get("/api/ingest/datasets", headers=h)
    assert r.status_code == 200 and "census" in r.json()


def test_unknown_dataset_404(client):
    h = {**auth_headers(client, "admin@alpha.gov"), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}
    r = client.post("/api/ingest/nope?anio=2020", headers=h,
                    files={"file": ("c.csv", io.BytesIO(CSV), "text/csv")})
    assert r.status_code == 404


def test_oversize_upload_rejected(client):
    h = {**auth_headers(client, "admin@alpha.gov"), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}
    big = b"x" * (26 * 1024 * 1024)
    r = client.post("/api/ingest/census?anio=2020", headers=h,
                    files={"file": ("big.csv", io.BytesIO(big), "text/csv")})
    assert r.status_code == 413


def test_runs_isolated_across_tenants(client):
    ha = {**auth_headers(client, "admin@alpha.gov"), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}
    up = client.post("/api/ingest/census?anio=2099", headers=ha,
                     files={"file": ("a.csv", io.BytesIO(CSV), "text/csv")})
    alpha_run_id = up.json()["id"]
    hb = auth_headers(client, "admin@beta.gov")
    beta_run_ids = {run["id"] for run in client.get("/api/ingest/runs", headers=hb).json()}
    assert alpha_run_id not in beta_run_ids  # beta cannot see alpha's tenant-scoped run
