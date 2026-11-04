import { describe, expect, it } from "vitest";
import { parseAvTexto } from "./parseAvTexto.ts";
import { serializeAvTexto, AV_TEXTO_HEADER } from "../shared/modules/av/texto.ts";

const SAMPLE = `${AV_TEXTO_HEADER}
semana	35
anio	2026
origen	Tendencias AV_2026

[UBICACION]
35	PROGRAMADO	CIUDAD	3
35	PRESENCIAL	CAMPUS	8
34	PRESENCIAL	CAMPUS	11
35	INCIDENCIA	RECOLETOS	4
35	CORRECTIVO	CIUDAD	17

[RESOLUCION]
35	REMOTO	REMOTO	ERRORES	7
35	REMOTO	REMOTO	CONEXION	5
35	REMOTO	REMOTO	OPERATIVA	7
35	PROGRAMADO	SALA	PREPARACION SALA	3
35	PRESENCIAL	SALA	DES/MONTAJE	8
35	INCIDENCIA	PROYECTOR	PROYECTOR	4
35	CORRECTIVO	EQUIPO AUDIO	CONFIGURACION	17

[MENSUAL]
2026	8	REMOTO	90
2025	8	REMOTO	110

[COMPARATIVA]
2025	35	REMOTO	11
2025	35	PROGRAMADO	4
`;

describe("AV texto plano", () => {
  it("lee el pegado de Drive con las filas TSV entre comillas", () => {
    const fromDrive = SAMPLE.split("\n")
      .map(line =>
        line.includes("\t") ? `"${line.replace(/"/g, '""')}"` : line
      )
      .join("\n");

    expect(parseAvTexto(fromDrive).document.meta.week).toBe("35");
    expect(parseAvTexto(fromDrive).weekly.maxWeek).toBe(35);
  });

  it("reconstruye matrices, resoluciones, mensual y comparativa", () => {
    const parsed = parseAvTexto(SAMPLE);

    expect(parsed.document.meta.week).toBe("35");
    expect(parsed.weekly.maxWeek).toBe(35);
    expect(parsed.weekly.byType.Remotos.categories?.rows.map((row) => row.label)).toEqual([
      "ERRORES",
      "CONEXION",
      "OPERATIVA",
    ]);
    expect(parsed.weekly.byType.Presenciales.locations?.weeks).toEqual([34, 35]);
    expect(
      parsed.weekly.byType.Presenciales.locations?.rows.find((row) => row.label === "CAMPUS")
        ?.values
    ).toEqual([11, 8]);
    expect(parsed.resolutions.Programados["35"]).toEqual([
      {
        category: "Programados",
        tier2: "SALA",
        tier3: "PREPARACION SALA",
        total: 3,
      },
    ]);
    expect(parsed.monthly.byType.Remotos["2026"]?.[7]).toBe(90);
    expect(parsed.comparisons.Remotos[0]).toEqual({
      year: 2025,
      totalsByWeek: { "35": 11 },
    });
  });

  it("round-trip serialise/parse keeps the numbers", () => {
    const once = parseAvTexto(SAMPLE);
    const again = parseAvTexto(serializeAvTexto(once.document));

    expect(again.document).toEqual(once.document);
    expect(again.weekly.byType.Programados.locations).toEqual(
      once.weekly.byType.Programados.locations
    );
  });

  it("lee la sección EVENTOS_EXTR con resumen, meses y totales", () => {
    const textWithExtr = `${SAMPLE}
[EVENTOS_EXTR]
resumen\tDestacan: Despliegue global People with Values en 6 territoriales; XXI Comisión Biodiversidad Premios Fronteras (Recoletos).
Enero\t4\t8\t4\t0\t2\t1\t5\t24
Octubre\t1\t4\t4\t0\t3\t2\t6\t20
Total\t11\t47\t31\t0\t8\t5\t33\t135
`;
    const parsed = parseAvTexto(textWithExtr);
    expect(parsed.document.eventosExtr).not.toBeNull();
    expect(parsed.document.eventosExtr?.resumen).toContain("People with Values");
    expect(parsed.document.eventosExtr?.meses).toHaveLength(2);
    expect(parsed.document.eventosExtr?.totales.Galicia).toBe(11);
    expect(parsed.document.eventosExtr?.totales.Norte).toBe(47);
    expect(parsed.document.eventosExtr?.totales.Total).toBe(135);
    expect(parsed.document.eventosExtr?.mesActual).toBe("Octubre");
    expect(parsed.monthly.territoriales).toEqual(parsed.document.eventosExtr);
  });

  it("rechaza un encabezado ajeno", () => {
    expect(() => parseAvTexto("AGA TEXTO PLANO v1\n")).toThrow(/plano de AV/);
  });
});
