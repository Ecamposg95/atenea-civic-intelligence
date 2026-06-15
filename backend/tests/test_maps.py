"""Tests for the maps areas endpoint and level filter."""

from app.database import get_db
from app.models.electoral_area import AreaLevel, ElectoralArea

from .conftest import auth_headers


def _seed_areas(client):
    # Insert two areas of different levels for the alpha org via the test session.
    from app.main import app  # noqa
    from sqlalchemy import select

    from app.models.organization import Organization

    db = next(app.dependency_overrides[get_db]())
    try:
        org = db.execute(
            select(Organization).where(Organization.slug == "alpha")
        ).scalar_one()
        db.add_all(
            [
                ElectoralArea(
                    organization_id=org.id,
                    name="Distrito 1",
                    code="D1",
                    level=AreaLevel.DISTRICT,
                ),
                ElectoralArea(
                    organization_id=org.id,
                    name="Entidad 1",
                    code="E1",
                    level=AreaLevel.STATE,
                ),
            ]
        )
        db.commit()
    finally:
        db.close()


def test_areas_requires_auth(client):
    assert client.get("/api/maps/areas").status_code == 401


def test_areas_returns_feature_collection(client):
    _seed_areas(client)
    headers = auth_headers(client, "admin@alpha.gov")
    resp = client.get("/api/maps/areas", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) >= 2


def test_areas_level_filter(client):
    headers = auth_headers(client, "admin@alpha.gov")
    resp = client.get("/api/maps/areas?level=district", headers=headers)
    assert resp.status_code == 200, resp.text
    levels = {f["properties"]["level"] for f in resp.json()["features"]}
    assert levels <= {"district"}
