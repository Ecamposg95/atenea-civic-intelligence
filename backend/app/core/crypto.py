"""Encryption helpers for sensitive fields (clave de elector).

Enfoque B: the service stores ciphertext + a masked display value. Decryption
exists only for the SPA-2 reveal flow (with audit) — not used in SPA-1.
The app fails fast if FERNET_KEY is missing: never store PII in clear.
"""
from __future__ import annotations

import hashlib
import hmac
from functools import lru_cache

from cryptography.fernet import Fernet

from app.core.config import settings


@lru_cache(maxsize=1)
def _build_fernet() -> Fernet:
    key = settings.FERNET_KEY
    if not key:
        raise RuntimeError(
            "FERNET_KEY is not set. Refusing to handle clave de elector without "
            "encryption. Set FERNET_KEY in the environment."
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def ensure_crypto_ready() -> None:
    """Validate the Fernet key at startup. Raises RuntimeError if misconfigured."""
    _build_fernet()


def encrypt_clave(plain: str) -> bytes:
    """Encrypt a clave de elector. Returns ciphertext bytes."""
    return _build_fernet().encrypt(plain.encode())


def decrypt_clave(ct: bytes) -> str:
    """Decrypt ciphertext back to the clave. SPA-2 reveal only."""
    return _build_fernet().decrypt(ct).decode()


def mask_clave(plain: str) -> str:
    """Return a masked display value, e.g. ``****-XYZ8``."""
    return f"****-{plain[-4:]}"


def normalize_clave(plain: str) -> str:
    """Canonical form of a clave de elector: no whitespace, upper-case."""
    return "".join(plain.split()).upper()


@lru_cache(maxsize=1)
def _hash_key() -> bytes:
    return hashlib.sha256(b"clave-hash:" + settings.SECRET_KEY.encode()).digest()


def hash_clave(plain: str) -> str:
    """Deterministic keyed hash (HMAC-SHA256, hex) of the normalized clave.

    Lets us detect duplicates without decrypting. The key is derived from
    SECRET_KEY, so the hash is useless outside this deployment."""
    return hmac.new(_hash_key(), normalize_clave(plain).encode(), hashlib.sha256).hexdigest()


@lru_cache(maxsize=1)
def _curp_hash_key() -> bytes:
    return hashlib.sha256(b"curp-hash:" + settings.SECRET_KEY.encode()).digest()


def hash_curp(plain: str) -> str:
    """HMAC-SHA256 (hex) of the normalized CURP; separate key from hash_clave."""
    return hmac.new(_curp_hash_key(), normalize_clave(plain).encode(), hashlib.sha256).hexdigest()


def encrypt_curp(plain: str) -> bytes:
    return _build_fernet().encrypt(plain.encode())


def decrypt_curp(ct: bytes) -> str:
    return _build_fernet().decrypt(ct).decode()


def mask_curp(plain: str) -> str:
    """Masked display value, e.g. ``****-AB12`` (same pattern as the clave)."""
    return f"****-{plain[-4:]}"
