import { describe, expect, it } from "vitest";
import { modelLogoUrl } from "./model-logos";

describe("model logo URLs", () => {
  it("uses the bundled Seedance logo for app-safe rendering", () => {
    expect(modelLogoUrl("Seedance 1.0", "ByteDance")).toBe(
      "/model-logos/seedance.png",
    );
  });
});
