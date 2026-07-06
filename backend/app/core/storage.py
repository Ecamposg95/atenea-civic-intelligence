"""S3-compatible object storage (Railway bucket) for militante documents.

Private bucket: no public URLs. Files are uploaded server-side and served via
short-lived presigned GETs. Mirrors crypto.py's fail-fast philosophy but is
feature-gated: the app only requires it when the militantes feature is used.
"""
from __future__ import annotations

from functools import lru_cache

from app.core.config import settings


def storage_enabled() -> bool:
    return bool(settings.BUCKET_NAME and settings.BUCKET_ENDPOINT
                and settings.BUCKET_ACCESS_KEY_ID and settings.BUCKET_SECRET_ACCESS_KEY)


@lru_cache(maxsize=1)
def _client():
    import boto3  # lazy: keeps the app/tests importable without boto3 until storage is used
    return boto3.client(
        "s3",
        endpoint_url=settings.BUCKET_ENDPOINT,
        aws_access_key_id=settings.BUCKET_ACCESS_KEY_ID,
        aws_secret_access_key=settings.BUCKET_SECRET_ACCESS_KEY,
        region_name=settings.BUCKET_REGION,
    )


def ensure_storage_ready() -> None:
    """Validate bucket config when the militantes feature needs it."""
    if not storage_enabled():
        raise RuntimeError(
            "Object storage is not configured. Set BUCKET_ENDPOINT, "
            "BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY, BUCKET_NAME."
        )


def put_object(key: str, data: bytes, content_type: str) -> None:
    _client().put_object(Bucket=settings.BUCKET_NAME, Key=key,
                         Body=data, ContentType=content_type)


def presigned_get(key: str, ttl: int = 60) -> str:
    return _client().generate_presigned_url(
        "get_object", Params={"Bucket": settings.BUCKET_NAME, "Key": key},
        ExpiresIn=ttl)


def delete_object(key: str) -> None:
    _client().delete_object(Bucket=settings.BUCKET_NAME, Key=key)
