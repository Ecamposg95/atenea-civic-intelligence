"""SeccionElectoral — resultado electoral histórico por sección (reference data)."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import UUIDMixin


class SeccionElectoral(UUIDMixin, Base):
    __tablename__ = "seccion_electoral"
    __table_args__ = (
        UniqueConstraint("seccion", "anio", name="uq_seccion_electoral_seccion_anio"),
    )

    seccion: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    municipio: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    anio: Mapped[int] = mapped_column(Integer, nullable=False)
    lista_nominal: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    votos: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    participacion: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    coalicion: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    morena: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    margen: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    prioridad: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
