import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Bars } from "../Bars";

describe("Bars", () => {
  it("renders each bar label and value", () => {
    const html = renderToStaticMarkup(
      <Bars items={[{ label: "4121", value: 612 }, { label: "4118", value: 540 }]} />,
    );
    expect(html).toContain("4121");
    expect(html).toContain("612");
    expect(html).toContain("4118");
    expect(html).toContain("540");
  });

  it("highlights the first bar with --c-warm when highlightFirst is set", () => {
    const html = renderToStaticMarkup(
      <Bars items={[{ label: "A", value: 10 }, { label: "B", value: 5 }]} highlightFirst />,
    );
    const [firstFill] = html.match(/background:rgb\(var\(--c-warm\)\)/g) ?? [];
    expect(firstFill).toBeTruthy();
  });

  it("scales bar width by value/max", () => {
    const html = renderToStaticMarkup(
      <Bars items={[{ label: "A", value: 100 }, { label: "B", value: 50 }]} />,
    );
    expect(html).toContain("width:100%");
    expect(html).toContain("width:50%");
  });
});
