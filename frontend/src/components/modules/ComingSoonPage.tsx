import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import type { ModuleDef } from "@/modules/registry";

export function ComingSoonPage({ module }: { module: ModuleDef }) {
  const Icon = module.icon;
  const soon = module.soon;
  return (
    <AppLayout title={module.label} crumb="Próximamente">
      <div className="mb-6 flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          <Icon width={24} height={24} />
        </div>
        <div>
          <div className="eyebrow">Módulo en desarrollo</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {module.label}
            <span className="ml-3 pill border-teal/30 bg-teal/10 text-teal align-middle">Pronto</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{soon?.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Capacidades previstas">
          <ul className="space-y-2">
            {soon?.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-sm text-ink">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {f}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Fuente de datos prevista">
          <p className="text-sm leading-relaxed text-ink-muted">{soon?.dataSource}</p>
        </Card>
      </div>
    </AppLayout>
  );
}
