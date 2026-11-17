import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AtlasCredit } from "@/components/brand/AtlasCredit";
import { CAMPAIGN_FALLBACK } from "@/components/brand/CampaignBrand";
import { Button } from "@/components/ui/Button";
import {
  AlertIcon,
  EyeIcon,
  EyeOffIcon,
  LogoMark,
  ShieldIcon,
} from "@/components/ui/icons";
import { useAuthStore } from "@/store/authStore";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuthStore();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await login(identifier, password);
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
        {/* Left — bandera de campaña (azul del candidato) */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-gradient p-12 text-white lg:flex xl:p-20">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
              backgroundSize: "72px 72px",
            }}
            aria-hidden="true"
          />
          <div
            className="reveal relative flex items-center gap-3"
            style={{ animationDelay: "0ms" }}
          >
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25">
              <LogoMark width={24} height={24} />
            </div>
            <div>
              <div className="font-display text-lg font-bold tracking-tight">Atenea</div>
              <div className="text-xs text-white/75">Plataforma de campaña</div>
            </div>
          </div>

          <div className="relative">
            <p
              className="reveal text-sm font-semibold text-white/85"
              style={{ animationDelay: "80ms" }}
            >
              {CAMPAIGN_FALLBACK.contienda}
            </p>
            <h1
              className="reveal mt-3 max-w-lg font-display text-5xl font-extrabold leading-[1.02] tracking-tight xl:text-6xl"
              style={{ animationDelay: "140ms" }}
            >
              {CAMPAIGN_FALLBACK.candidatoCompleto}
            </h1>
            <span aria-hidden="true" className="reveal mt-8 block h-1.5 w-24 rounded-full bg-white" style={{ animationDelay: "200ms" }} />
            <p
              className="reveal mt-6 max-w-sm text-base leading-relaxed text-white/85"
              style={{ animationDelay: "240ms" }}
            >
              Cada sección, cada promovido y cada compromiso en un solo lugar.
            </p>
          </div>

          <div
            className="reveal relative flex items-center gap-2 text-xs text-white/75"
            style={{ animationDelay: "300ms" }}
          >
            <ShieldIcon width={15} height={15} /> Datos personales cifrados y cada consulta auditada
          </div>
        </aside>

        {/* Right — sign-in card */}
        <section className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div
              className="reveal mb-6 overflow-hidden rounded-xl bg-brand-gradient px-5 py-4 text-white shadow-glow-accent lg:hidden"
              style={{ animationDelay: "0ms" }}
            >
              <div className="text-xs font-semibold text-white/85">
                {CAMPAIGN_FALLBACK.contienda}
              </div>
              <div className="mt-1 font-display text-xl font-bold leading-tight tracking-tight">
                {CAMPAIGN_FALLBACK.candidatoCompleto}
              </div>
            </div>

            <div className="card-premium hud-corners reveal p-8" style={{ animationDelay: "120ms" }}>
              <div className="eyebrow">Iniciar sesión</div>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
                Entra a la plataforma
              </h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Usa tus credenciales institucionales.
              </p>

              <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="identifier" className="field-label">
                    Teléfono o correo
                  </label>
                  <input
                    id="identifier"
                    type="text"
                    inputMode="text"
                    autoComplete="username"
                    autoFocus
                    className="field-input"
                    placeholder="Teléfono o correo electrónico"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="password" className="field-label">
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="field-input pr-11"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                      }
                      aria-pressed={showPassword}
                      className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-ink-faint transition-colors hover:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                    >
                      {showPassword ? (
                        <EyeOffIcon width={17} height={17} />
                      ) : (
                        <EyeIcon width={17} height={17} />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="reveal flex items-start gap-2 rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 text-sm text-state-critical"
                  >
                    <AlertIcon
                      width={16}
                      height={16}
                      className="mt-0.5 shrink-0"
                    />
                    <span>{error}</span>
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
            </div>

            <AtlasCredit className="reveal mt-6" />
          </div>
        </section>
      </div>
    </div>
  );
}
