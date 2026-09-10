import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { isValidElement, type ReactNode } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import type { OficinasDeckPage } from "../shared/modules/oficinas/types";

/**
 * Every chart of the report reads left to right from the oldest reading to the
 * most recent one: 2023 opens the group and 2026 closes it, the compared week
 * opens it and the current one closes it.
 *
 * The share pages used to draw the current period first and the compared one
 * after it, which put the newest bar on the left of every group while the
 * weekly and territorial pages already read the other way.
 */

type Components = {
  CategorySharePage: (props: Record<string, unknown>) => ReactNode;
  CategoryBarChart: unknown;
};

let components: Components;

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        export { default as CategorySharePage } from "./client/src/modules/oficinas/pages/CategorySharePage";
        export { default as CategoryBarChart } from "./client/src/components/deck/CategoryBarChart";
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
      visit(node.props.editor);
    }
  }
  visit(tree);
  expect(matches).toHaveLength(1);
  return matches[0];
}

const PAGE = {
  id: "oficinas-peticiones-tipo",
  kind: "ofiPeticionesTipo",
  supportType: null,
  text: {},
  visible: true,
  weekSelection: null,
  years: null,
  overrides: {},
} as unknown as OficinasDeckPage;

function seriesOf(comparison?: { label: string; entries: unknown[] }) {
  const tree = components.CategorySharePage({
    page: PAGE,
    editing: false,
    onChange: () => {},
    entries: [
      { label: "AMPLIACION", imported: 40 },
      { label: "SINIESTRO", imported: 12 },
    ],
    column: "2026",
    seriesLabel: "2026",
    comparison,
  });
  return propsOf<{ series: { key: string; label: string; color: string }[] }>(
    tree,
    components.CategoryBarChart
  ).series;
}

function seriesLabels(comparison?: { label: string; entries: unknown[] }) {
  return seriesOf(comparison).map(entry => entry.label);
}

describe("Share chart series order", () => {
  it("opens each group with the compared year and closes it with the current one", () => {
    expect(
      seriesLabels({
        label: "2025",
        entries: [
          { label: "AMPLIACION", imported: 31 },
          { label: "SINIESTRO", imported: 9 },
        ],
      })
    ).toEqual(["2025", "2026"]);
  });

  it("draws the single series alone when there is nothing to compare against", () => {
    expect(seriesLabels()).toEqual(["2026"]);
  });

  it("colours each year with the deck palette, not the positional series tokens", () => {
    expect(
      seriesOf({
        label: "2025",
        entries: [
          { label: "AMPLIACION", imported: 31 },
          { label: "SINIESTRO", imported: 9 },
        ],
      })
    ).toEqual([
      { key: "comparacion", label: "2025", color: "var(--informe-serie-3)" },
      { key: "valor", label: "2026", color: "var(--informe-serie-1)" },
    ]);
  });
});
