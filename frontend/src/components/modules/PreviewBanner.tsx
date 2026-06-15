import { AlertIcon } from "@/components/ui/icons";

export function PreviewBanner({ note }: { note?: string }) {
  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-state-warning/30 bg-state-warning/10 px-3 py-2.5 text-sm text-state-warning">
      <AlertIcon width={16} height={16} className="shrink-0" />
      <span>
        {note ?? "Datos de muestra · Preview de la plataforma. Las cifras son ilustrativas."}
      </span>
    </div>
  );
}
