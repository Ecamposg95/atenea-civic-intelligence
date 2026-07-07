import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricCard } from "../MetricCard";

// Mock Sparkline to simplify the test (not testing sparkline rendering here)
vi.mock("../Sparkline", () => ({
  Sparkline: ({ data }: { data: number[] }) => (
    <div data-testid="sparkline">Sparkline with {data.length} points</div>
  ),
}));

describe("MetricCard", () => {
  it("renders warm tone with context line and delta", () => {
    const html = renderToStaticMarkup(
      <MetricCard
        label="Promovidos"
        value="3,502"
        tone="warm"
        delta="8.2%"
        context="meta 4,000"
      />,
    );

    // Assert that all expected text appears in the rendered output
    expect(html).toContain("Promovidos");
    expect(html).toContain("3,502");
    expect(html).toContain("meta 4,000");
    expect(html).toContain("8.2%");

    // Assert that the context line has the expected class for muted text
    expect(html).toContain("text-ink-faint");
  });

  it("renders warm tone without context (backward compatible)", () => {
    const html = renderToStaticMarkup(
      <MetricCard
        label="Activistas"
        value="1,234"
        tone="warm"
        delta="5.0%"
      />,
    );

    expect(html).toContain("Activistas");
    expect(html).toContain("1,234");
    expect(html).toContain("5.0%");
  });

  it("renders accent tone with context (backward compatible with new feature)", () => {
    const html = renderToStaticMarkup(
      <MetricCard
        label="Afiliados"
        value="892"
        tone="accent"
        delta="2.1%"
        context="baseline 875"
      />,
    );

    expect(html).toContain("Afiliados");
    expect(html).toContain("892");
    expect(html).toContain("2.1%");
    expect(html).toContain("baseline 875");
  });
});
