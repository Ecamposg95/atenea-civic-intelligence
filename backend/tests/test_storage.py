from unittest.mock import MagicMock
import app.core.storage as storage


def test_storage_disabled_when_unconfigured(monkeypatch):
    monkeypatch.setattr(storage.settings, "BUCKET_NAME", "")
    assert storage.storage_enabled() is False


def test_put_object_calls_boto(monkeypatch):
    fake = MagicMock()
    monkeypatch.setattr(storage, "_client", lambda: fake)
    monkeypatch.setattr(storage.settings, "BUCKET_NAME", "agora-uploads")
    storage.put_object("militantes/c/m/frente.jpg", b"xx", "image/jpeg")
    fake.put_object.assert_called_once()
    kwargs = fake.put_object.call_args.kwargs
    assert kwargs["Bucket"] == "agora-uploads"
    assert kwargs["Key"] == "militantes/c/m/frente.jpg"
    assert kwargs["Body"] == b"xx"


def test_presigned_get_returns_url(monkeypatch):
    fake = MagicMock()
    fake.generate_presigned_url.return_value = "https://signed"
    monkeypatch.setattr(storage, "_client", lambda: fake)
    monkeypatch.setattr(storage.settings, "BUCKET_NAME", "agora-uploads")
    assert storage.presigned_get("k") == "https://signed"
