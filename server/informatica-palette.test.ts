import { describe, expect, it } from "vitest";
import {
  COLOR_2023,
  COLOR_2024,
  COLOR_2025,
  COLOR_2026,
  COLOR_OTHER,
  citaTypeColor,
  hicMetricColor,
  hicWorkOrderColor,
  imacMetricColor,
  renoveAmbitoColor,
  top5CategoryColor,
  topTenMonthColor,
  workOrderTypeLabel,
} from "../client/src/modules/informatica/palette.ts";

describe("Informatica series palette", () => {
  it("paints work orders as 2025 and incidents as 2026", () => {
    expect(hicWorkOrderColor("workOrders")).toBe(COLOR_2025);
    expect(hicWorkOrderColor("incidencias")).toBe(COLOR_2026);
  });

  it("paints the three HIC metrics as 2024, 2025 and 2026", () => {
    expect(hicMetricColor("Asignadas")).toBe(COLOR_2024);
    expect(hicMetricColor("Asignaciones")).toBe(COLOR_2025);
    expect(hicMetricColor("Resueltas")).toBe(COLOR_2026);
  });

  it("keeps Top 5 colours by category name, not by rank", () => {
    expect(top5CategoryColor("TELEFONO", 0)).toBe(COLOR_2026);
    expect(top5CategoryColor("Teléfono", 1)).toBe(COLOR_2026);
    expect(top5CategoryColor("HARDWARE", 0)).toBe(COLOR_2025);
    expect(top5CategoryColor("IMPRESORA", 0)).toBe(COLOR_2024);
    expect(top5CategoryColor("APLICACIONES", 0)).toBe(COLOR_2023);
    expect(top5CategoryColor("EQUIPO", 0)).toBe(COLOR_OTHER);
  });

  it("paints July 2026 blue and August 2026 orange", () => {
    expect(topTenMonthColor("Jul 26", 0, 2)).toBe(COLOR_2025);
    expect(topTenMonthColor("Ago 26", 1, 2)).toBe(COLOR_2026);
  });

  it("paints booked appointments as 2025 and walk-up as 2026", () => {
    expect(citaTypeColor("Con Cita")).toBe(COLOR_2025);
    expect(citaTypeColor("Sin Cita")).toBe(COLOR_2026);
  });

  it("paints IMAC requests as 2025 and interventions as 2026", () => {
    expect(imacMetricColor("solicitudes")).toBe(COLOR_2025);
    expect(imacMetricColor("intervenciones")).toBe(COLOR_2026);
  });

  it("paints Holding as 2025 and España as 2026", () => {
    expect(renoveAmbitoColor("Holding")).toBe(COLOR_2025);
    expect(renoveAmbitoColor("España")).toBe(COLOR_2026);
  });

  it("shortens Audiovisuales to AV on the WorkOrders matrix", () => {
    expect(workOrderTypeLabel("Audiovisuales")).toBe("AV");
    expect(workOrderTypeLabel("ASISTENCIA AUDIOVISUALES")).toBe("ASISTENCIA AV");
    expect(workOrderTypeLabel("Acompañamiento")).toBe("Acompañamiento");
  });
});
