"""Tiny in-process TTL cache for external-source responses."""

from __future__ import annotations

import time
from typing import Any, Callable


class TTLCache:
    def __init__(self, ttl_seconds: float = 900.0, now: Callable[[], float] = time.monotonic) -> None:
        self._ttl = ttl_seconds
        self._now = now
        self._store: dict[str, tuple[float, Any]] = {}

    def get_or_set(self, key: str, loader: Callable[[], Any]) -> Any:
        hit = self._store.get(key)
        now = self._now()
        if hit is not None and (now - hit[0]) < self._ttl:
            return hit[1]
        value = loader()
        self._store[key] = (now, value)
        return value

    def clear(self) -> None:
        self._store.clear()
