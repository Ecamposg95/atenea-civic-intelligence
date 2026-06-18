import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { useThemeStore } from "@/store/themeStore";

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      aria-pressed={!isDark}
      title={isDark ? "Tema claro" : "Tema oscuro"}
      className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-ink-muted transition-colors hover:border-accent hover:text-ink"
    >
      {isDark ? <SunIcon width={17} height={17} /> : <MoonIcon width={17} height={17} />}
    </button>
  );
}
