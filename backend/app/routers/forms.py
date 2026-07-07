"""/api/forms — atención ciudadana form builder (schema-validated CRUD)."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.atencion import (
    CANAL_PATTERN, FormDefinitionCreate, FormDefinitionList, FormDefinitionRead, TIPO_PATTERN,
)
from app.services import form_service
from app.services.form_schema import SchemaInvalid

router = APIRouter(tags=["forms"])

# Builder (create/list/get/update) is COORDINADOR+ only — form design is a
# supervisory operation, unlike the /slug lookup used by capture-tier clients.
_BUILDER = Annotated[object, Depends(require_roles(UserRole.COORDINADOR, UserRole.ADMIN))]
_CAPTURE = Annotated[object, Depends(require_roles(
    UserRole.ACTIVISTA, UserRole.CAPTURISTA, UserRole.LIDER,
    UserRole.COORDINADOR, UserRole.ADMIN))]


class FormDefinitionUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=160)
    descripcion: Optional[str] = Field(default=None, max_length=1000)
    tipo: Optional[str] = Field(default=None, pattern=TIPO_PATTERN)
    slug: Optional[str] = Field(default=None, min_length=2, max_length=120)
    canal: Optional[str] = Field(default=None, pattern=CANAL_PATTERN)
    schema: Optional[dict] = None
    is_active: Optional[bool] = None


@router.post("/forms", response_model=FormDefinitionRead, status_code=status.HTTP_201_CREATED)
def create(db: DbSession, ctx: CampaignCtx, _p: _BUILDER, data: FormDefinitionCreate):
    try:
        f = form_service.create_form(db, ctx, data)
    except SchemaInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except form_service.SlugConflict:
        raise HTTPException(status_code=409, detail="Ya existe un formulario con ese slug")
    return FormDefinitionRead.model_validate(f, from_attributes=True)


@router.get("/forms", response_model=FormDefinitionList)
def list_(db: DbSession, ctx: CampaignCtx, _p: _BUILDER,
          tipo: Annotated[Optional[str], Query()] = None,
          canal: Annotated[Optional[str], Query()] = None,
          is_active: Annotated[Optional[bool], Query()] = None,
          q: Annotated[Optional[str], Query()] = None,
          limit: Annotated[int, Query(ge=1, le=200)] = 50,
          offset: Annotated[int, Query(ge=0)] = 0):
    rows, total = form_service.list_forms(
        db, ctx, tipo=tipo, canal=canal, is_active=is_active, q=q, limit=limit, offset=offset)
    return FormDefinitionList(
        items=[FormDefinitionRead.model_validate(r, from_attributes=True) for r in rows],
        total=total, limit=limit, offset=offset)


@router.get("/forms/slug/{slug}", response_model=FormDefinitionRead)
def get_by_slug(db: DbSession, ctx: CampaignCtx, _p: _CAPTURE, slug: str):
    f = form_service.get_by_slug(db, ctx, slug)
    if f is None:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    return FormDefinitionRead.model_validate(f, from_attributes=True)


@router.get("/forms/{form_id}", response_model=FormDefinitionRead)
def get_one(db: DbSession, ctx: CampaignCtx, _p: _BUILDER, form_id: str):
    f = form_service.get_form(db, ctx, form_id)
    if f is None:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    return FormDefinitionRead.model_validate(f, from_attributes=True)


@router.patch("/forms/{form_id}", response_model=FormDefinitionRead)
def update(db: DbSession, ctx: CampaignCtx, _p: _BUILDER, form_id: str, data: FormDefinitionUpdate):
    try:
        f = form_service.update_form(db, ctx, form_id, data)
    except SchemaInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except form_service.SlugConflict:
        raise HTTPException(status_code=409, detail="Ya existe un formulario con ese slug")
    if f is None:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    return FormDefinitionRead.model_validate(f, from_attributes=True)
