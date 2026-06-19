from app.models.ingestion import DataSource, IngestRun, IngestStatus, SourceKind
from app.models.census import CensusMetric


def test_ingestion_model_shapes():
    assert {c.name for c in DataSource.__table__.columns} >= {"id", "organization_id", "name", "kind"}
    assert DataSource.__table__.c.organization_id.nullable is True
    assert {c.name for c in IngestRun.__table__.columns} >= {
        "id", "organization_id", "campaign_id", "source_id", "dataset", "file_name",
        "file_hash", "status", "rows_read", "rows_inserted", "rows_skipped", "rows_failed",
    }
    assert IngestStatus.RUNNING.value == "running"
    assert {c.name for c in CensusMetric.__table__.columns} >= {
        "id", "organization_id", "ingest_run_id", "anio", "nivel", "territory_code", "area_id", "indicador", "valor",
    }
    assert CensusMetric.__table__.c.organization_id.nullable is True
    assert CensusMetric.__table__.c.area_id.nullable is True
