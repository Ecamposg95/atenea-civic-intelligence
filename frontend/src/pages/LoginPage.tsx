import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import {
  AnalyticsIcon,
  LayersIcon,
  LogoMark,
  MapIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { useAuthStore } from "@/store/authStore";

const FEATURES = [
  { icon: MapIcon, label: "Mapas electorales y territoriales" },
  { icon: AnalyticsIcon, label: "Analítica de participación" },
  { icon: LayersIcon, label: "Gobernanza de datos electorales" },
];

const CAPABILITIES = [
  "API-first · Multi-tenant",
  "PostGIS · Geoespacial",
  "Auditoría integral",
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) navigate("/");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg bg-mesh">
      {/* Atmosphere */}
      <div
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-50"
        aria-hidden="true"
      />
      <div className="grain" aria-hidden="true" />
      <div
        className="aura -left-24 -top-32 h-[28rem] w-[28rem] animate-float"
        aria-hidden="true"
      />
      <div
        className="aura aura-teal -bottom-32 right-0 h-[26rem] w-[26rem] animate-float"
        style={{ animationDelay: "1.5s" }}
        aria-hidden="true"
      />

      <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-2">
        {/* Left — brand showcase */}
        <aside className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16">
          <div
            className="reveal flex items-center gap-3"
            style={{ animationDelay: "0ms" }}
          >
            <div className="metric-chip relative h-11 w-11 text-accent shadow-glow">
              <LogoMark width={24} height={24} />
            </div>
            <div>
              <div className="font-display text-base font-semibold tracking-tight text-ink">
                Ágora
              </div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">
                Civic Intelligence
              </div>
            </div>
          </div>

          <div className="relative max-w-lg">
            <div className="reveal eyebrow" style={{ animationDelay: "80ms" }}>
              GovTech Command Center
            </div>
            <h1
              className="reveal mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink xl:text-5xl"
              style={{ animationDelay: "140ms" }}
            >
              <span className="text-gradient">Inteligencia cívica</span>,
              <br />
              electoral y territorial.
            </h1>
            <p
              className="reveal mt-5 max-w-md text-sm leading-relaxed text-ink-muted"
              style={{ animationDelay: "200ms" }}
            >
              Plataforma privacy-by-design para instituciones: mapas unificados,
              dashboards ejecutivos, gobernanza de datos electorales y analítica
              de participación, con auditabilidad total.
            </p>

            <ul className="mt-8 space-y-3.5">
              {FEATURES.map(({ icon: Icon, label }, i) => (
                <li
                  key={label}
                  className="reveal flex items-center gap-3 text-sm text-ink-muted"
                  style={{ animationDelay: `${260 + i * 70}ms` }}
                >
                  <span className="metric-chip h-9 w-9 text-accent">
                    <Icon width={16} height={16} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>

            <div
              className="reveal mt-9 flex flex-wrap gap-2.5"
              style={{ animationDelay: "480ms" }}
            >
              {CAPABILITIES.map((cap) => (
                <span
                  key={cap}
                  className="pill border-line-strong font-mono uppercase tracking-wider text-ink-muted"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>

          <div
            className="reveal flex items-center gap-2 text-xs text-ink-faint"
            style={{ animationDelay: "560ms" }}
          >
            <ShieldIcon width={15} height={15} /> Privacy-by-design · Audit-logged
            · Multi-tenant ready
          </div>
        </aside>

        {/* Right — sign-in card */}
        <section className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div
              className="reveal mb-6 flex items-center gap-3 lg:hidden"
              style={{ animationDelay: "0ms" }}
            >
              <div className="metric-chip h-10 w-10 text-accent shadow-glow">
                <LogoMark width={22} height={22} />
              </div>
              <div className="font-display text-sm font-semibold tracking-tight text-ink">
                Ágora · Civic Intelligence
              </div>
            </div>

            <div className="card-premium reveal p-8" style={{ animationDelay: "120ms" }}>
              <div className="eyebrow">Iniciar sesión</div>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
                Acceso al command center
              </h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Usa tus credenciales institucionales.
              </p>

              <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="email" className="field-label">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="field-input"
                    placeholder="analyst@institution.gov"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="password" className="field-label">
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    className="field-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div className="reveal rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full shadow-glow-accent"
                  disabled={loading}
                >
                  {loading ? "Autenticando…" : "Iniciar sesión"}
                </Button>
              </form>

              <p className="mt-6 text-center text-[11px] text-ink-faint">
                Conecta credenciales institucionales para continuar.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
