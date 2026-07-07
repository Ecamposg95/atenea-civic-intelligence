import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CountdownElectoral } from "@/components/CountdownElectoral";

// This project's vitest environment is "node" (no jsdom/testing-library
// installed — see vitest.config.ts + package.json). Component output is
// asserted via server-rendered markup instead of DOM queries.
//
// AnimatedNumber drives its display via a requestAnimationFrame loop kicked
// off in useEffect; effects never run under renderToStaticMarkup, so its
// *real* implementation would statically render the animation's resting
// start value (0), not the actual día count. Mock it to a plain passthrough
// so the assertions exercise CountdownElectoral's date math, not
// AnimatedNumber's animation internals (which are covered separately).
vi.mock("@/components/ui/AnimatedNumber", () => ({
  AnimatedNumber: ({ value, className }: { value: number; className?: string }) => (
    <span className={className}>{value}</span>
  ),
}));

describe("CountdownElectoral", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders días remaining for a fixed future date (tolerant of the seam)", () => {
    // Fixed "now" so the test never depends on real Date.now() beyond a
    // small, explicit tolerance window.
    const fixedNow = new Date("2026-07-06T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    // ~2 days and a few hours out.
    const future = new Date(fixedNow.getTime() + 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000);

    const html = renderToStaticMarkup(
      <CountdownElectoral date={future.toISOString()} />,
    );

    // The días figure must be the exact computed value (2), rendered via the
    // mocked AnimatedNumber — not a substring match that could coincidentally
    // hit a class name or unrelated digit elsewhere in the markup.
    expect(html).toMatch(/>2<\/span>/);
    expect(html).toMatch(/d[ií]as?/);
    expect(html).toContain("5 h");
    expect(html).not.toMatch(/Configura la fecha/);
    expect(html).not.toMatch(/Jornada electoral/);
  });

  it("renders the configuration CTA when date is null", () => {
    const html = renderToStaticMarkup(<CountdownElectoral date={null} />);

    expect(html).toContain("Configura la fecha de elección");
  });

  it("renders 'Jornada electoral' for a date in the past", () => {
    const fixedNow = new Date("2026-07-06T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const past = new Date(fixedNow.getTime() - 60 * 60 * 1000);
    const html = renderToStaticMarkup(<CountdownElectoral date={past.toISOString()} />);

    expect(html).toContain("Jornada electoral");
  });
});
