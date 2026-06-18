// frontend/src/components/ui/SkeletonCard.tsx
/** Pulsing placeholder card; defaults match .card-premium dimensions. */
export function SkeletonCard({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`card-premium animate-pulse space-y-3 p-5 ${className}`}>
      <div className="h-3 w-1/3 rounded bg-panel-hover" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-panel-hover" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Pulsing placeholder for table bodies. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 rounded bg-panel-hover" />
      ))}
    </div>
  );
}
