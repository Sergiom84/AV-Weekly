import { describe, expect, it } from "vitest";
import { workOrderTypeLabel } from "../client/src/modules/informatica/palette.ts";

describe("Informatica display labels", () => {
  it("shortens Audiovisuales to AV on the WorkOrders matrix", () => {
    expect(workOrderTypeLabel("Audiovisuales")).toBe("AV");
    expect(workOrderTypeLabel("ASISTENCIA AUDIOVISUALES")).toBe("ASISTENCIA AV");
    expect(workOrderTypeLabel("Acompañamiento")).toBe("Acompañamiento");
  });
});
