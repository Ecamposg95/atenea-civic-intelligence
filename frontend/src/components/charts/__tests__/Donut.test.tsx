import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Donut } from "../Donut";

// Donut's public API is `{ data, height }` (DonutDatum[]) and has existing
// consumers across the app (Panorama, Demografia, Denue, Economia, Indice,
// AnalyticsPage). This task is additive-only: the enhancements below (center
// total, optional centerLabel, tighter segment gap) must not require any
// changes at call sites.
describe("Donut", () => {
  it("keeps compiling with the legacy { data, height } call shape", () => {
    // No centerLabel passed — mirrors every existing consumer.
    const html = renderToStaticMarkup(<Donut data={[{ name: "A", value: 10 }, { name: "B", value: 20 }]} height={200} />);
    expect(html).toBeTruthy();
  });

  it("renders an accessible role and the center total", () => {
    const html = renderToStaticMarkup(
      <Donut data={[{ name: "A", value: 10 }, { name: "B", value: 20 }]} />,
    );
    expect(html).toMatch(/role="img"/);
    expect(html).toContain("30"); // sum of values
  });

  it("renders the optional centerLabel below the total", () => {
    const html = renderToStaticMarkup(
      <Donut data={[{ name: "A", value: 5 }, { name: "B", value: 5 }]} centerLabel="Casos" />,
    );
    expect(html).toContain("Casos");
    expect(html).toContain("10");
  });
});
