"""Form definition/answers validation (pure, no DB). JSON-schema-driven forms."""
from __future__ import annotations

FIELD_TYPES = {"text", "textarea", "number", "date", "select", "multiselect",
               "boolean", "phone", "email", "seccion", "foto"}


class SchemaInvalid(Exception):
    ...


class AnswersInvalid(Exception):
    ...


def _fields(schema: dict):
    for sec in schema.get("secciones", []):
        for f in sec.get("campos", []):
            yield f


def validate_schema(schema: dict) -> None:
    if not isinstance(schema, dict) or "secciones" not in schema:
        raise SchemaInvalid("schema must have 'secciones'")
    keys = set()
    for f in _fields(schema):
        if not f.get("key") or not f.get("tipo") or not f.get("label"):
            raise SchemaInvalid("each field needs key/tipo/label")
        if f["tipo"] not in FIELD_TYPES:
            raise SchemaInvalid(f"unknown field type: {f['tipo']}")
        if f["key"] in keys:
            raise SchemaInvalid(f"duplicate key: {f['key']}")
        keys.add(f["key"])
        if f["tipo"] in ("select", "multiselect") and not f.get("opciones"):
            raise SchemaInvalid(f"{f['key']} needs opciones")


def _visible(schema: dict, answers: dict, field: dict) -> bool:
    cond = field.get("mostrar_si")
    if not cond:
        return True
    return answers.get(cond.get("campo")) == cond.get("igual")


def validate_answers(schema: dict, answers: dict) -> dict:
    validate_schema(schema)
    out = {}
    for f in _fields(schema):
        key = f["key"]
        if not _visible(schema, answers, f):
            continue
        val = answers.get(key)
        if f.get("requerido") and (val is None or val == "" or val == []):
            raise AnswersInvalid(f"campo requerido: {key}")
        if val is not None:
            out[key] = val
    return out


def split_sensitive(schema: dict, answers: dict) -> tuple[dict, dict]:
    sensitive_keys = {f["key"] for f in _fields(schema) if f.get("sensible")}
    pub = {k: v for k, v in answers.items() if k not in sensitive_keys}
    sens = {k: v for k, v in answers.items() if k in sensitive_keys}
    return pub, sens
