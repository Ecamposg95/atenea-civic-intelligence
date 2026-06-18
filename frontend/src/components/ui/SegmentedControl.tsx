// frontend/src/components/ui/SegmentedControl.tsx
import { useRef, type ComponentType, type KeyboardEvent } from "react";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  icon?: ComponentType<{ width?: number; height?: number; className?: string }>;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible label for the tablist. */
  ariaLabel: string;
  size?: "sm" | "md";
}

/**
 * Accessible segmented / tab switch. role=tablist with roving tabindex and
 * Arrow/Home/End keyboard navigation. Replaces ad-hoc segmented buttons.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (i: number) => {
    const next = (i + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].id);
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(i + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(options.length - 1);
    }
  };

  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex gap-1 rounded-lg border border-line bg-panel p-1"
    >
      {options.map((o, i) => {
        const active = o.id === value;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            type="button"
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${pad} ${
              active
                ? "bg-accent/10 text-accent ring-1 ring-inset ring-accent/25"
                : "text-ink-muted hover:bg-panel-hover hover:text-ink"
            }`}
          >
            {Icon && <Icon width={15} height={15} className="shrink-0" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
