"""/api/sprints + /api/workitems + /api/tablero — Scrum board.

Route order: /tablero and the /workitems collection are declared before
/workitems/{wid}. Governance (create/update/delete workitem, sprint CRUD,
create tasks) = ADMIN/COORDINADOR. Moving a card / toggling a task = the item's
responsable or a coordinator (enforced in the service; router maps NoAutorizado
→ 403). Reads = capture tier (all campaign roles). Convert = acuerdo write tier.
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.scrum import (
    Board, Burndown, CeremoniaCreate, SprintCreate, SprintList, SprintMetrics,
    SprintRead, SprintUpdate, TaskCreate, TaskRead, TaskUpdate, VelocidadPunto,
    WorkItemCreate, WorkItemEstadoUpdate, WorkItemList, WorkItemRead, WorkItemUpdate,
)
from app.schemas.minuta import MinutaCreate, MinutaList, MinutaRead
from app.services import minuta_service, scrum_service

router = APIRouter(tags=["scrum"])

_GOV = Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.COORDINADOR))]
_READ = Annotated[object, Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER,
    UserRole.ACTIVISTA, UserRole.CAPTURISTA))]
_MOVE = _READ           # move-card is open to the read tier; ownership enforced in service
_CONVERT = Annotated[object, Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER))]


# ── Sprints ──
@router.post("/sprints", response_model=SprintRead, status_code=201)
def create_sprint(data: SprintCreate, db: DbSession, ctx: CampaignCtx, _p: _GOV):
    try:
        s = scrum_service.create_sprint(db, ctx, data)
    except scrum_service.SprintActivoExiste:
        raise HTTPException(409, "Ya hay un sprint activo en la campaña")
    db.commit()
    return SprintRead.model_validate(s, from_attributes=True)


@router.get("/sprints", response_model=SprintList)
def list_sprints(db: DbSession, ctx: CampaignCtx, _p: _READ,
                 estado: Annotated[Optional[str], Query()] = None,
                 limit: Annotated[int, Query(ge=1, le=200)] = 50,
                 offset: Annotated[int, Query(ge=0)] = 0):
    rows, total = scrum_service.list_sprints(db, ctx, estado=estado, limit=limit, offset=offset)
    return SprintList(items=[SprintRead.model_validate(s, from_attributes=True) for s in rows],
                      total=total, limit=limit, offset=offset)


@router.get("/sprints/{sid}", response_model=SprintRead)
def get_sprint(sid: str, db: DbSession, ctx: CampaignCtx, _p: _READ):
    s = scrum_service.get_sprint(db, ctx, sid)
    if s is None:
        raise HTTPException(404, "Sprint no encontrado")
    return SprintRead.model_validate(s, from_attributes=True)


@router.patch("/sprints/{sid}", response_model=SprintRead)
def update_sprint(sid: str, data: SprintUpdate, db: DbSession, ctx: CampaignCtx, _p: _GOV):
    try:
        s = scrum_service.update_sprint(db, ctx, sid, data)
    except scrum_service.SprintActivoExiste:
        raise HTTPException(409, "Ya hay un sprint activo en la campaña")
    if s is None:
        raise HTTPException(404, "Sprint no encontrado")
    db.commit()
    return SprintRead.model_validate(s, from_attributes=True)


@router.delete("/sprints/{sid}", status_code=204)
def delete_sprint(sid: str, db: DbSession, ctx: CampaignCtx, _p: _GOV):
    if not scrum_service.delete_sprint(db, ctx, sid):
        raise HTTPException(404, "Sprint no encontrado")
    db.commit()


@router.post("/sprints/{sid}/activar", response_model=SprintRead)
def activar_sprint(sid: str, db: DbSession, ctx: CampaignCtx, _p: _GOV):
    try:
        s = scrum_service.activar_sprint(db, ctx, sid)
    except scrum_service.SprintActivoExiste:
        raise HTTPException(409, "Ya hay un sprint activo en la campaña")
    if s is None:
        raise HTTPException(404, "Sprint no encontrado")
    db.commit()
    return SprintRead.model_validate(s, from_attributes=True)


@router.post("/sprints/{sid}/cerrar", response_model=SprintRead)
def cerrar_sprint(sid: str, db: DbSession, ctx: CampaignCtx, _p: _GOV):
    s = scrum_service.cerrar_sprint(db, ctx, sid)
    if s is None:
        raise HTTPException(404, "Sprint no encontrado")
    db.commit()
    return SprintRead.model_validate(s, from_attributes=True)


# ── Tablero (antes de /workitems/{wid}) ──
@router.get("/tablero", response_model=Board)
def tablero(db: DbSession, ctx: CampaignCtx, _p: _READ):
    b = scrum_service.board(db, ctx)
    return Board(
        sprint=SprintRead.model_validate(b["sprint"], from_attributes=True) if b["sprint"] else None,
        POR_HACER=[WorkItemRead.model_validate(w, from_attributes=True) for w in b["POR_HACER"]],
        EN_CURSO=[WorkItemRead.model_validate(w, from_attributes=True) for w in b["EN_CURSO"]],
        HECHO=[WorkItemRead.model_validate(w, from_attributes=True) for w in b["HECHO"]],
    )


# ── WorkItems ──
@router.post("/workitems", response_model=WorkItemRead, status_code=201)
def create_workitem(data: WorkItemCreate, db: DbSession, ctx: CampaignCtx, _p: _GOV):
    wi = scrum_service.create_workitem(db, ctx, data); db.commit()
    return WorkItemRead.model_validate(wi, from_attributes=True)


@router.get("/workitems", response_model=WorkItemList)
def list_workitems(db: DbSession, ctx: CampaignCtx, _p: _READ,
                   sprint_id: Annotated[Optional[str], Query()] = None,
                   estado: Annotated[Optional[str], Query()] = None,
                   responsable_id: Annotated[Optional[str], Query()] = None,
                   tipo: Annotated[Optional[str], Query()] = None,
                   q: Annotated[Optional[str], Query()] = None,
                   limit: Annotated[int, Query(ge=1, le=200)] = 50,
                   offset: Annotated[int, Query(ge=0)] = 0):
    rows, total = scrum_service.list_workitems(db, ctx, sprint_id=sprint_id, estado=estado,
                                               responsable_id=responsable_id, tipo=tipo, q=q,
                                               limit=limit, offset=offset)
    return WorkItemList(items=[WorkItemRead.model_validate(w, from_attributes=True) for w in rows],
                        total=total, limit=limit, offset=offset)


@router.get("/workitems/{wid}", response_model=WorkItemRead)
def get_workitem(wid: str, db: DbSession, ctx: CampaignCtx, _p: _READ):
    wi = scrum_service.get_workitem(db, ctx, wid)
    if wi is None:
        raise HTTPException(404, "WorkItem no encontrado")
    return WorkItemRead.model_validate(wi, from_attributes=True)


@router.patch("/workitems/{wid}", response_model=WorkItemRead)
def update_workitem(wid: str, data: WorkItemUpdate, db: DbSession, ctx: CampaignCtx, _p: _GOV):
    wi = scrum_service.update_workitem(db, ctx, wid, data)
    if wi is None:
        raise HTTPException(404, "WorkItem no encontrado")
    db.commit()
    return WorkItemRead.model_validate(wi, from_attributes=True)


@router.patch("/workitems/{wid}/estado", response_model=WorkItemRead)
def mover_estado(wid: str, data: WorkItemEstadoUpdate, db: DbSession, ctx: CampaignCtx, _p: _MOVE):
    try:
        wi = scrum_service.mover_estado(db, ctx, wid, data.estado)
    except scrum_service.NoAutorizado:
        raise HTTPException(403, "Solo el responsable o un coordinador puede mover esta tarjeta")
    if wi is None:
        raise HTTPException(404, "WorkItem no encontrado")
    db.commit()
    return WorkItemRead.model_validate(wi, from_attributes=True)


@router.delete("/workitems/{wid}", status_code=204)
def delete_workitem(wid: str, db: DbSession, ctx: CampaignCtx, _p: _GOV):
    if not scrum_service.delete_workitem(db, ctx, wid):
        raise HTTPException(404, "WorkItem no encontrado")
    db.commit()


# ── Tareas ──
@router.post("/workitems/{wid}/tareas", response_model=TaskRead, status_code=201)
def add_task(wid: str, data: TaskCreate, db: DbSession, ctx: CampaignCtx, _p: _GOV):
    t = scrum_service.add_task(db, ctx, wid, data)
    if t is None:
        raise HTTPException(404, "WorkItem no encontrado")
    db.commit()
    return TaskRead.model_validate(t, from_attributes=True)


@router.patch("/workitems/{wid}/tareas/{tid}", response_model=TaskRead)
def update_task(wid: str, tid: str, data: TaskUpdate, db: DbSession, ctx: CampaignCtx, _p: _MOVE):
    try:
        t = scrum_service.update_task(db, ctx, wid, tid, data)
    except scrum_service.NoAutorizado:
        raise HTTPException(403, "Solo el responsable o un coordinador puede editar esta tarea")
    if t is None:
        raise HTTPException(404, "Tarea no encontrada")
    db.commit()
    return TaskRead.model_validate(t, from_attributes=True)


@router.delete("/workitems/{wid}/tareas/{tid}", status_code=204)
def delete_task(wid: str, tid: str, db: DbSession, ctx: CampaignCtx, _p: _GOV):
    if not scrum_service.delete_task(db, ctx, wid, tid):
        raise HTTPException(404, "Tarea no encontrada")
    db.commit()


# ── Puente: convertir acuerdo → workitem ──
@router.post("/minutas/{mid}/acuerdos/{aid}/convertir", response_model=WorkItemRead, status_code=201)
def convertir_acuerdo(mid: str, aid: str, db: DbSession, ctx: CampaignCtx, _p: _CONVERT):
    try:
        wi = scrum_service.convertir_acuerdo(db, ctx, mid, aid)
    except scrum_service.YaConvertido:
        raise HTTPException(409, "Este acuerdo ya fue convertido")
    if wi is None:
        raise HTTPException(404, "Acuerdo no encontrado")
    db.commit()
    return WorkItemRead.model_validate(wi, from_attributes=True)


# ── Métricas + ceremonias (lectura sin commit; crear ceremonia sí commitea) ──
@router.get("/scrum/velocidad", response_model=list[VelocidadPunto])
def velocidad(db: DbSession, ctx: CampaignCtx, _p: _READ,
              n: Annotated[int, Query(ge=1, le=24)] = 6):
    return [VelocidadPunto(**v) for v in scrum_service.velocidad(db, ctx, n=n)]


@router.get("/sprints/{sid}/metrics", response_model=SprintMetrics)
def sprint_metrics(sid: str, db: DbSession, ctx: CampaignCtx, _p: _READ):
    m = scrum_service.sprint_metrics(db, ctx, sid)
    if m is None:
        raise HTTPException(404, "Sprint no encontrado")
    return SprintMetrics(**m)


@router.get("/sprints/{sid}/burndown", response_model=Burndown)
def burndown(sid: str, db: DbSession, ctx: CampaignCtx, _p: _READ):
    bd = scrum_service.burndown(db, ctx, sid)
    if bd is None:
        raise HTTPException(404, "Sprint no encontrado")
    return Burndown(**bd)


@router.post("/sprints/{sid}/ceremonias", response_model=MinutaRead, status_code=201)
def crear_ceremonia(sid: str, data: CeremoniaCreate, db: DbSession, ctx: CampaignCtx, _p: _CONVERT):
    # _CONVERT = ADMIN/COORDINADOR/LIDER (minuta write tier). Validate the sprint
    # belongs to the caller's campaign before linking (B owns this check).
    if scrum_service.get_sprint(db, ctx, sid) is None:
        raise HTTPException(404, "Sprint no encontrado")
    m = minuta_service.create_minuta(db, ctx, MinutaCreate(
        titulo=data.titulo, fecha=data.fecha, tipo=data.tipo,
        lugar=data.lugar, cuerpo=data.cuerpo, sprint_id=sid))
    db.commit()
    return MinutaRead.model_validate(m, from_attributes=True)


@router.get("/sprints/{sid}/ceremonias", response_model=MinutaList)
def listar_ceremonias(sid: str, db: DbSession, ctx: CampaignCtx, _p: _READ,
                      limit: Annotated[int, Query(ge=1, le=200)] = 50,
                      offset: Annotated[int, Query(ge=0)] = 0):
    rows, total = minuta_service.list_minutas(db, ctx, sprint_id=sid, limit=limit, offset=offset)
    return MinutaList(items=[MinutaRead.model_validate(m, from_attributes=True) for m in rows],
                      total=total, limit=limit, offset=offset)
