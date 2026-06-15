// frontend/src/modules/ai-analyst/fixtures.ts
export interface CannedAnswer { q: string; a: string; }

export const SUGGESTED: string[] = [
  "¿Qué entidades tienen menor participación?",
  "Resume la cobertura territorial actual.",
  "¿Cuántos eventos de auditoría hubo esta semana?",
];

export const CANNED: CannedAnswer[] = [
  { q: SUGGESTED[0], a: "En los datos de muestra, Veracruz (57%) y Jalisco (59%) están por debajo del promedio nacional (61.2%). Recomendaría priorizar campañas de difusión en esas entidades." },
  { q: SUGGESTED[1], a: "La plataforma tiene cargadas 32 entidades (nivel estatal). Los niveles de distrito y sección están disponibles para ingesta cuando se confirme la fuente cartográfica del SIGE." },
  { q: SUGGESTED[2], a: "La bitácora de auditoría registra los accesos y acciones sensibles de la semana. Consulta el módulo Auditoría & Cumplimiento para el detalle con filtros." },
];
