import { useCampaignStore } from "@/store/campaignStore";

/** Fallback estático (Login y antes de que cargue /campaigns/mine). */
export const CAMPAIGN_FALLBACK = {
  candidato: "Víctor Manuel Garduño",
  candidatoCompleto: "Víctor Manuel Garduño Garrido",
  contienda: "San Mateo Atenco 2027",
};

/** Candidato + contienda de la campaña activa, con fallback estático. */
export function useCampaignIdentity() {
  const campaign = useCampaignStore((s) =>
    s.campaigns.find((c) => c.id === s.activeId),
  );
  return {
    candidato: campaign?.candidato?.trim() || CAMPAIGN_FALLBACK.candidato,
    // App SMA-only: el nombre interno de la campaña (p.ej. "Campaña Demo 2027") no se muestra.
    contienda: CAMPAIGN_FALLBACK.contienda,
  };
}

/**
 * Bandera de campaña: bloque sólido en azul del candidato con texto blanco
 * (contraste ≥ 6.6:1 en ambos temas). Es el elemento de identidad principal.
 */
export function CampaignBanner({ className = "" }: { className?: string }) {
  const { candidato, contienda } = useCampaignIdentity();
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-brand-gradient px-4 py-3.5 text-white shadow-glow-accent ${className}`}
    >
      {/* Franja superior: firma visual de la campaña */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-white/25" />
      <div className="text-[11px] font-medium text-white/80">{contienda}</div>
      <div className="mt-0.5 font-display text-[17px] font-bold leading-tight tracking-tight">
        {candidato}
      </div>
    </div>
  );
}
