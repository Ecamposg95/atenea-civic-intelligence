import { useEffect, useState } from "react";

import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

interface CountdownElectoralProps {
  /** ISO date string for election day, or null if not yet configured. */
  date: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const TICK_MS = 60_000; // re-evaluate once per minute

/**
 * Hero countdown widget: días + horas remaining to `date`.
 * - `date === null` → CTA to configure the election date.
 * - `date` in the past (or unparsable) → "Jornada electoral" state.
 * - otherwise → animated días counter + horas chip.
 */
export function CountdownElectoral({ date }: CountdownElectoralProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (!date) {
    return (
      <div className="card-premium flex items-center gap-3 px-4 py-3">
        <span className="metric-chip h-9 w-9 shrink-0 text-accent">
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" />
          </svg>
        </span>
        <div>
          <div className="eyebrow mb-0.5">Jornada electoral</div>
          <div className="text-sm text-ink-muted">
            Configura la fecha de elección
          </div>
        </div>
      </div>
    );
  }

  const targetMs = new Date(date).getTime();
  const diffMs = Number.isNaN(targetMs) ? NaN : targetMs - now;
  const isPast = !Number.isFinite(diffMs) ? false : diffMs <= 0;

  if (Number.isNaN(diffMs)) {
    // Defensive fallback — an unparsable date behaves like "not configured".
    return (
      <div className="card-premium flex items-center gap-3 px-4 py-3">
        <div>
          <div className="eyebrow mb-0.5">Jornada electoral</div>
          <div className="text-sm text-ink-muted">
            Configura la fecha de elección
          </div>
        </div>
      </div>
    );
  }

  if (isPast) {
    return (
      <div className="card-premium px-4 py-3">
        <div className="eyebrow mb-1">Cuenta regresiva electoral</div>
        <div className="text-gradient font-display text-2xl font-bold">
          Jornada electoral
        </div>
      </div>
    );
  }

  const days = Math.floor(diffMs / DAY_MS);
  const hours = Math.floor((diffMs % DAY_MS) / HOUR_MS);

  return (
    <div className="card-premium px-4 py-3">
      <div className="eyebrow mb-1.5">Cuenta regresiva electoral</div>
      <div className="flex items-baseline gap-2.5">
        <AnimatedNumber
          value={days}
          className="text-gradient font-display text-3xl font-bold tabular-nums"
        />
        <span className="text-sm text-ink-muted">
          {days === 1 ? "día" : "días"}
        </span>
        <span className="metric-chip px-2.5 py-1 font-mono text-xs text-ink-muted">
          {hours} h
        </span>
      </div>
    </div>
  );
}
