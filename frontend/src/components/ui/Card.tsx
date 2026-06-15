import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  raised?: boolean;
  className?: string;
  /** Show a small gradient accent dot before the title. */
  accentDot?: boolean;
}

export function Card({
  title,
  action,
  children,
  raised,
  className,
  accentDot,
}: CardProps) {
  return (
    <div
      className={`${raised ? "panel-raised" : "card-premium"} p-5${
        className ? ` ${className}` : ""
      }`}
    >
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
            {accentDot && (
              <span className="h-1.5 w-1.5 rounded-full bg-accent-gradient shadow-glow" />
            )}
            {title}
          </span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
