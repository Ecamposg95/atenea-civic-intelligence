"""/api/casos — atención ciudadana case lifecycle + coordinator panorama.

Route order matters: /casos/panorama must be declared before /casos/{cid} so
FastAPI doesn't swallow it as a path parameter (mirrors militantes.py).

Gates: read/create (list/get/eventos) = capture tier (ACTIVISTA+); estado
change/reassignment/panorama = review tier (COORDINADOR+). Casos themselves
are only opened via a form response (see routers/responses.py) — there is no
direct POST /casos in this task's scope.
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.atencion import (
    CasoAsignarUpdate, CasoEstadoUpdate, CasoEventoCreate, CasoEventoRead, CasoList,
    CasoPanorama, CasoRead, PanoramaKpis, PanoramaPorColonia, PanoramaPorResponsable,
)
from app.services import caso_service

router = APIRouter(tags=["casos"])

_CAPTURE = Annotated[object, Depends(require_roles(
    UserRole.ACTIVISTA, UserRole.CAPTURISTA, UserRole.LIDER,
    UserRole.COORDINADOR, UserRole.ADMIN))]
_REVIEW = Annotated[object, Depends(require_roles(UserRole.COORDINADOR, UserRole.ADMIN))]


def _to_panorama(data: dict) -> CasoPanorama:
    """Adapt caso_service.panorama()'s dict (kpis.por_estado nested) into the
    CasoPanorama schema (por_estado promoted to top-level; kpis broken out per
    estado bucket)."""
    kpis = data["kpis"]
    por_estado = kpis.get("por_estado") or {}
    return CasoPanorama(
        kpis=PanoramaKpis(
            total=kpis["total"],
            pendientes=por_estado.get("PENDIENTE", 0),
            en_proceso=por_estado.get("EN_PROCESO", 0),
            atendidos=por_estado.get("ATENDIDO", 0),
            cerrados=por_estado.get("CERRADO", 0),
            sla_vencidos=kpis["sla_vencidos"],
            tiempo_prom_dias=kpis.get("tiempo_prom_dias"),
        ),
        por_estado=por_estado,
        por_colonia=[PanoramaPorColonia(**c) for c in data["por_colonia"]],
        por_responsable=[PanoramaPorResponsable(**r) for r in data["por_responsable"]],
    )


# /panorama must be registered before /{cid} — same route-order pitfall as
# /militantes/panorama vs /militantes/{mid}.
@router.get("/casos/panorama", response_model=CasoPanorama)
def panorama(db: DbSession, ctx: CampaignCtx, _p: _REVIEW):
    return _to_panorama(caso_service.panorama(db, ctx))


@router.get("/casos", response_model=CasoList)
def list_(db: DbSession, ctx: CampaignCtx, _p: _CAPTURE,
          estado: Annotated[Optional[str], Query()] = None,
          colonia: Annotated[Optional[str], Query()] = None,
          asignado: Annotated[Optional[str], Query()] = None,
          tipo: Annotated[Optional[str], Query()] = None,
          q: Annotated[Optional[str], Query()] = None,
          limit: Annotated[int, Query(ge=1, le=200)] = 50,
          offset: Annotated[int, Query(ge=0)] = 0):
    rows, total, has_territory = caso_service.list_casos(
        db, ctx, estado=estado, colonia=colonia, asignado=asignado, tipo=tipo, q=q,
        limit=limit, offset=offset)
    return CasoList(
        items=[CasoRead.model_validate(r, from_attributes=True) for r in rows],
        total=total, limit=limit, offset=offset, has_territory=has_territory)


@router.get("/casos/{cid}", response_model=CasoRead)
def get_one(db: DbSession, ctx: CampaignCtx, _p: _CAPTURE, cid: str):
    c = caso_service.get_caso(db, ctx, cid)
    if c is None:
        raise HTTPException(status_code=404, detail="Caso no encontrado")
    return CasoRead.model_validate(c, from_attributes=True)


@router.patch("/casos/{cid}/estado", response_model=CasoRead)
def set_estado(db: DbSession, ctx: CampaignCtx, _p: _REVIEW, cid: str, data: CasoEstadoUpdate):
    c = caso_service.set_estado(db, ctx, cid, data.estado, data.nota)
    if c is None:
        raise HTTPException(status_code=404, detail="Caso no encontrado")
    return CasoRead.model_validate(c, from_attributes=True)


@router.patch("/casos/{cid}/asignar", response_model=CasoRead)
def asignar(db: DbSession, ctx: CampaignCtx, _p: _REVIEW, cid: str, data: CasoAsignarUpdate):
    c = caso_service.asignar(db, ctx, cid, data.asignado_a, data.nota)
    if c is None:
        raise HTTPException(status_code=404, detail="Caso no encontrado")
    return CasoRead.model_validate(c, from_attributes=True)


@router.post("/casos/{cid}/eventos", response_model=CasoEventoRead, status_code=status.HTTP_201_CREATED)
def add_evento(db: DbSession, ctx: CampaignCtx, _p: _CAPTURE, cid: str, data: CasoEventoCreate):
    evento = caso_service.add_evento(db, ctx, cid, data.tipo, texto=data.texto)
    if evento is None:
        raise HTTPException(status_code=404, detail="Caso no encontrado")
    return CasoEventoRead(
        id=evento.id, caso_id=evento.caso_id, tipo=evento.tipo, texto=evento.texto,
        evidencia_url=None, actor_nombre=None, created_at=evento.created_at)
