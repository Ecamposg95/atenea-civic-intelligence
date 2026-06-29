import { useEffect } from "react";

import { apiClient } from "@/api/client";
import { useAuthStore } from "@/store/authStore";
import { useCampaignStore, type Campaign } from "@/store/campaignStore";

export function CampaignSwitcher() {
  const activeId = useCampaignStore((s) => s.activeId);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const setActive = useCampaignStore((s) => s.setActive);
  const clearActive = useCampaignStore((s) => s.clearActive);
  const setCampaigns = useCampaignStore((s) => s.setCampaigns);
  const isSuperadmin = useAuthStore((s) => s.user?.role === "superadmin");

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Campaign[]>("/campaigns/mine")
      .then((res) => {
        if (!cancelled) {
          setCampaigns(res.data);
        }
      })
      .catch(() => {
        /* silent — no campaigns available or not yet set up */
      });
    return () => {
      cancelled = true;
    };
  }, [setCampaigns]);

  if (campaigns.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <label
        htmlFor="campaign-switcher"
        className="hidden text-xs text-ink-muted sm:block"
      >
        Campaña:
      </label>
      <select
        id="campaign-switcher"
        aria-label="Campaña activa"
        value={activeId ?? ""}
        onChange={(e) => {
          if (e.target.value === "") {
            clearActive();
          } else {
            setActive(e.target.value);
          }
        }}
        className="focus-ring h-9 rounded-lg border border-line bg-panel-raised px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-ink"
      >
        {isSuperadmin && (
          <option value="">Todas las bases (consolidado)</option>
        )}
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.cycle}
          </option>
        ))}
      </select>
    </div>
  );
}
