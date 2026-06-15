from app.integrations.intel.cache import TTLCache


def test_cache_returns_cached_value_within_ttl():
    calls = {"n": 0}
    cache = TTLCache(ttl_seconds=100, now=lambda: 1000.0)

    def loader():
        calls["n"] += 1
        return {"v": calls["n"]}

    assert cache.get_or_set("k", loader) == {"v": 1}
    assert cache.get_or_set("k", loader) == {"v": 1}  # cached, loader not called again
    assert calls["n"] == 1


def test_cache_expires_after_ttl():
    t = {"now": 1000.0}
    calls = {"n": 0}
    cache = TTLCache(ttl_seconds=10, now=lambda: t["now"])

    def loader():
        calls["n"] += 1
        return calls["n"]

    assert cache.get_or_set("k", loader) == 1
    t["now"] = 1011.0  # past ttl
    assert cache.get_or_set("k", loader) == 2
    assert calls["n"] == 2
