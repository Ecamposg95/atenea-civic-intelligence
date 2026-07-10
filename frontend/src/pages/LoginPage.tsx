import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

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
        {/* Left — brand */}
        <aside className="relative hidden flex-col items-start justify-center overflow-hidden p-12 lg:flex xl:p-20">
          <div className="relative">
            <div
              className="reveal flex items-center gap-3.5"
              style={{ animationDelay: "0ms" }}
            >
              <div className="metric-chip relative h-14 w-14 text-accent shadow-glow">
                <LogoMark width={30} height={30} />
              </div>
              <div>
                <div className="font-display text-2xl font-bold tracking-tight text-ink">
                  Atenea
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                  Civic Intelligence
                </div>
              </div>
            </div>

            <h1
              className="reveal mt-10 max-w-md font-display text-4xl font-bold leading-[1.08] tracking-tight text-ink xl:text-5xl"
              style={{ animationDelay: "120ms" }}
            >
              <span className="text-gradient">Inteligencia</span>
              <br />
              que se convierte
              <br />
              en acción.
            </h1>
          </div>

          <div
            className="reveal absolute bottom-12 left-12 flex items-center gap-2 text-xs text-ink-faint xl:left-20"
            style={{ animationDelay: "260ms" }}
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
                Atenea · Civic Intelligence
              </div>
            </div>

            <div className="card-premium hud-corners reveal p-8" style={{ animationDelay: "120ms" }}>
              <div className="eyebrow">Iniciar sesión</div>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
                Acceso al command center
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
          </div>
        </section>
      </div>
    </div>
  );
}
