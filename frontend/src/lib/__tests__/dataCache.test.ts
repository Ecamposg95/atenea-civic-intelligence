import { beforeEach, describe, expect, it } from "vitest";

import { cacheGet, cacheKey, cacheSet, clearDataCache } from "@/lib/dataCache";
import { lazyPreload } from "@/lib/lazyPreload";

describe("dataCache", () => {
  beforeEach(() => clearDataCache());

  it("keys by namespace and deps", () => {
    expect(cacheKey("A#1", [1, "x"])).not.toBe(cacheKey("A#1", [2, "x"]));
    expect(cacheKey("A#1", [1])).not.toBe(cacheKey("B#1", [1]));
    expect(cacheKey("A#1", [1])).toBe(cacheKey("A#1", [1]));
  });

  it("stores, returns and clears values", () => {
    const k = cacheKey("P#1", ["q"]);
    expect(cacheGet(k)).toBeUndefined();
    cacheSet(k, { total: 3 });
    expect(cacheGet(k)).toEqual({ total: 3 });
    clearDataCache();
    expect(cacheGet(k)).toBeUndefined();
  });

  it("evicts the oldest entry past the cap", () => {
    for (let i = 0; i < 90; i++) cacheSet(`k${i}`, i);
    expect(cacheGet("k0")).toBeUndefined();
    expect(cacheGet("k89")).toBe(89);
  });
});

describe("lazyPreload", () => {
  it("runs the factory once and retries after a failure", async () => {
    let calls = 0;
    let fail = true;
    const C = lazyPreload(async () => {
      calls++;
      if (fail) throw new Error("net");
      return { default: () => null };
    });
    await expect(C.preload()).rejects.toThrow("net");
    fail = false;
    await C.preload();
    await C.preload();
    expect(calls).toBe(2);
  });
});
