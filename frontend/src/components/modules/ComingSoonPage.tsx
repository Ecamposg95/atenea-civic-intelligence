import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import type { ModuleDef } from "@/modules/registry";

export function ComingSoonPage({ module }: { module: ModuleDef }) {
  const Icon = module.icon;
  const soon = module.soon;
  return (
    <AppLayout title={module.label} crumb="Próximamente">
      {/* ---- Hero ---- */}
      <section className="relative mb-7 overflow-hidden">
        <div className="aura -left-16 -top-24 h-72 w-72" aria-hidden="true" />
        <div className="aura aura-teal right-0 -top-16 h-64 w-64" aria-hidden="true" />
        <div className="aura aura-amber left-1/3 -top-10 h-56 w-56" aria-hidden="true" />

        <div className="reveal relative flex items-start gap-5">
          <span className="metric-chip hud-corners h-14 w-14 shrink-0 text-accent shadow-glow-accent">
            <Icon width={26} height={26} />
          </span>
          <div className="min-w-0">
            <div className="eyebrow">Módulo en desarrollo</div>
            <h1 className="mt-2 flex flex-wrap items-center gap-3 font-display text-3xl font-bold leading-[1.05] tracking-tight md:text-4xl">
              <span className="text-gradient">{module.label}</span>
              <span className="pill border-teal/30 bg-teal/10 text-teal">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-pulse-glow rounded-full bg-teal" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
                </span>
                Pronto
              </span>
            </h1>
            {soon?.summary && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
                {soon.summary}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="reveal" style={{ animationDelay: "120ms" }}>
          <Card title="Capacidades previstas" accentDot className="h-full">
            <ul className="space-y-2.5">
              {soon?.features.map((f, i) => (
                <li
                  key={f}
                  className="reveal group flex items-start gap-2.5 rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-sm text-ink transition-all hover:-translate-y-0.5 hover:border-line-strong hover:bg-panel-hover"
                  style={{ animationDelay: `${180 + i * 60}ms` }}
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-gradient shadow-glow transition-transform group-hover:scale-125" />
                  {f}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="reveal" style={{ animationDelay: "200ms" }}>
          <Card
            title="Fuente de datos prevista"
            accentDot
            className="h-full"
            action={<span className="pill border-line text-ink-muted">por conectar</span>}
          >
            <div className="rounded-lg border border-line bg-bg-sunken px-4 py-3.5">
              <div className="eyebrow mb-2 flex items-center gap-2 text-teal">
                <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-glow-teal" />
                Origen previsto
              </div>
              <p className="text-sm leading-relaxed text-ink-muted">{soon?.dataSource}</p>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Aún no disponible — esta vista es una previsualización del módulo.
            </p>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
