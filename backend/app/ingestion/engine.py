"""Ingestion orchestrator: open run → read → validate → bulk insert → finalize."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete

from app.ingestion.readers import read_tabular
from app.ingestion.validation import validate_rows
from app.models.ingestion import IngestRun, IngestStatus

BATCH = 5000
_DISCARD_SAMPLE = 20


@dataclass
class IngestRunResult:
    run_id: str
    status: str
    inserted: int
    skipped: int


def _file_hash(path) -> str:
    h = hashlib.sha256()
    h.update(Path(path).read_bytes())
    return h.hexdigest()


def run_ingest(db, ctx, spec, file_path, *, source, extra=None, replace=False) -> IngestRunResult:
    extra = extra or {}

    # Fix 2: compute file_hash inside the try so missing-file errors record a FAILED run.
    # We create the run with a placeholder hash first so we get a run.id for the audit row,
    # then update the hash once the file is confirmed readable.
    run = IngestRun(
        organization_id=ctx.organization_id,
        campaign_id=getattr(ctx, "campaign_id", None),
        source_id=(source.id if source is not None else None),
        dataset=spec.key,
        file_name=Path(file_path).name,
        file_hash=None,
        status=IngestStatus.RUNNING,
        started_at=datetime.now(timezone.utc),
        created_by=getattr(getattr(ctx, "user", None), "id", None),
    )
    db.add(run)
    db.flush()  # run.id available

    # Fix 2: initialize these before the try so the post-try discard block never NameErrors
    good: list = []
    discards: list = []

    try:
        # Fix 2: hash + read + validate are all inside the try so any file/encoding error
        # records a FAILED run instead of propagating out of run_ingest uncaught.
        run.file_hash = _file_hash(file_path)
        rows, _header = read_tabular(file_path)
        good, discards = validate_rows(rows, spec.columns)
        run.rows_read = len(rows)
        run.rows_skipped = len(discards)

        # --replace: delete prior rows for this scope BEFORE insert, in the SAME
        # transaction, so a later failure rolls back the delete too (prior data preserved).
        if replace:
            # Fix 1: guard against unconditional DELETE when scope_filter returns no clauses
            clauses = spec.scope_filter(spec.model, ctx, extra)
            if not clauses:
                raise ValueError(
                    f"replace=True requires a non-empty scope_filter for dataset '{spec.key}'"
                )
            db.execute(delete(spec.model).where(*clauses))

        inserted = 0
        batch = []
        for r in good:
            batch.append(spec.model(**spec.row_mapper(r, ctx, run, extra)))
            if len(batch) >= BATCH:
                db.add_all(batch)
                db.flush()
                inserted += len(batch)
                batch = []
        if batch:
            db.add_all(batch)
            db.flush()
            inserted += len(batch)
        run.rows_inserted = inserted
        if inserted == 0:
            run.status = IngestStatus.FAILED
        elif discards:
            run.status = IngestStatus.PARTIAL
        else:
            run.status = IngestStatus.SUCCESS
    except Exception as e:  # noqa: BLE001 — record failure on the run
        db.rollback()
        # After rollback, run's initial flush was also rolled back — the DB has no row
        # for run.id yet. db.merge() will SELECT (find nothing) then INSERT the failure
        # record from the in-memory object state, which is the correct outcome.
        # Fix 5: if merge itself raises on a dead connection, the FAILED record may not
        # persist (accepted limitation in single-session deployments).
        run = db.merge(run)
        run.status = IngestStatus.FAILED
        run.rows_inserted = 0
        # Fix 4: record how many validated rows failed to persist
        run.rows_failed = len(good)
        run.error_summary = f"insert error: {e}"

    if discards:
        sample = "; ".join(
            f"row {d['row_index']}: {d['reason']}" for d in discards[:_DISCARD_SAMPLE]
        )
        run.error_summary = (
            ((run.error_summary or "") + f" discards={len(discards)} [{sample}]").strip()
        )
    run.finished_at = datetime.now(timezone.utc)
    db.commit()
    return IngestRunResult(
        run_id=run.id,
        status=run.status.value,
        inserted=run.rows_inserted,
        skipped=run.rows_skipped,
    )
