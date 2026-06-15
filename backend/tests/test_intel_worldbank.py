from app.integrations.intel import worldbank

PAYLOAD = [
    {"page": 1, "pages": 1},
    [
        {"date": "2022", "value": 1.0, "indicator": {"id": "NY.GDP.MKTP.CD", "value": "GDP"}},
        {"date": "2021", "value": None, "indicator": {"id": "NY.GDP.MKTP.CD", "value": "GDP"}},
        {"date": "2020", "value": 2.0, "indicator": {"id": "NY.GDP.MKTP.CD", "value": "GDP"}},
    ],
]


def test_indicators_registry_nonempty():
    assert len(worldbank.list_indicators()) >= 3
    assert all({"code", "label"} <= set(i) for i in worldbank.list_indicators())


def test_fetch_indicator_normalizes_sorted_dropping_nulls():
    r = worldbank.fetch_indicator("NY.GDP.MKTP.CD", fetch=lambda url, params: PAYLOAD)
    assert r["indicator"] == "NY.GDP.MKTP.CD"
    assert r["points"] == [{"year": 2020, "value": 2.0}, {"year": 2022, "value": 1.0}]
    assert r["latest"] == {"year": 2022, "value": 1.0}
