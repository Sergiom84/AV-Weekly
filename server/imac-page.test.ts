import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { isValidElement, type ReactNode } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import type { OficinasDataPageProps } from "../client/src/modules/oficinas/pages/PageShell";
import type { OficinasRow } from "../shared/modules/oficinas/types";

type Components = {
  ImacPage: (props: OficinasDataPageProps) => ReactNode;
  WeeklyBarChart: unknown;
  SemanalTable: unknown;
  ValueGrid: unknown;
};

let components: Components;

beforeAll(async () => {
  // Bundle the real component and its child identities, with no DOM or mocks.
  // Calling ImacPage executes its data wiring; child components stay as elements.
  const result = await build({
    stdin: {
      contents: `
        export { default as ImacPage } from "./client/src/modules/oficinas/pages/ImacPage";
        export { default as WeeklyBarChart } from "./client/src/components/deck/WeeklyBarChart";
        export { default as SemanalTable } from "./client/src/modules/oficinas/pages/SemanalTable";
        export { default as ValueGrid } from "./client/src/components/deck/EditorValueGrid";
      `,
      resolveDir: path.resolve(import.meta.dirname, ".."),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    write: false,
    logLevel: "silent",
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(
    module,
    module.exports,
    createRequire(import.meta.url)
  );
  components = module.exports as Components;
});

function propsOf<T>(tree: ReactNode, component: unknown): T {
  const matches: T[] = [];
  function visit(node: ReactNode) {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (
      isValidElement<{ children?: ReactNode; editor?: ReactNode }>(node)
    ) {
      if (node.type === component) matches.push(node.props as T);
      visit(node.props.children);
      // Selectors and correction grids hang off the `editor` prop of the page
      // shell, outside the printable slide, so a walk over children alone would
      // never reach the grid this test is about.
      visit(node.props.editor);
    }
  }
  visit(tree);
  expect(matches).toHaveLength(1);
  return matches[0];
}

function fixture(
  value: number | null,
  units: number | null = value
): OficinasDataPageProps {
  const values = (first: number, last: number) => [
    { year: 2026, week: 34, value: first },
    { year: 2026, week: 35, value: last },
  ];
  return {
    page: {
      id: "imac-behavior",
      kind: "ofiImac",
      supportType: null,
      text: {},
      visible: true,
      weekSelection: null,
      years: null,
      overrides: { "peticiones:S35": value, "intervenciones:S35": units },
    },
    editing: true,
    onChange: () => {},
    dataset: {
      year: 2026,
      source: { sourceFile: null, uploadedAt: null },
      imac: {
        peticionesByWeek: values(8, 10),
        intervencionesByWeek: values(30, 40),
        byTipo: [{ label: "AMPLIACION", values: values(8, 10) }],
      },
    },
  };
}

describe("IMAC component manual corrections", () => {
  it.each([
    [99, 99],
    [0, 0],
    [null, null],
    [99, 777],
    [0, 777],
  ])(
    "passes requests %s and units %s to the chart, table and editor",
    (requests, units) => {
      const input = fixture(requests, units);
      const before = structuredClone(input.dataset);
      const tree = components.ImacPage(input);
      const chart = propsOf<{ data: Record<string, number | string | null>[] }>(
        tree,
        components.WeeklyBarChart
      );
      const table = propsOf<{ rows: OficinasRow[]; totalRow: boolean }>(
        tree,
        components.SemanalTable
      );
      const grid = propsOf<{ rows: { cells: { value: number | null }[] }[] }>(
        tree,
        components.ValueGrid
      );

      expect(chart.data).toEqual([
        { semana: "S34", peticiones: 8, intervenciones: 30 },
        { semana: "S35", peticiones: requests, intervenciones: units },
      ]);
      for (const [index, label, original, value] of [
        [0, "Peticiones", 8, requests],
        [1, "Intervenciones", 30, units],
      ] as const) {
        expect(table.rows[index]).toEqual({
          label,
          values: [
            { year: 2026, week: 34, value: original },
            ...(value === null ? [] : [{ year: 2026, week: 35, value }]),
          ],
        });
        expect(grid.rows[index].cells.map(cell => cell.value)).toEqual([
          original,
          value,
        ]);
      }
      expect(table.totalRow).toBe(false);
      expect(input.dataset).toEqual(before);
    }
  );
});
