import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { KpiItem } from "../client/src/components/deck/KpiRow";

type Components = {
  KpiRow: (props: { items: KpiItem[]; compact?: boolean }) => ReactNode;
  KpiLabelProvider: (props: {
    editing: boolean;
    labels: Record<string, string>;
    onRename: (key: string, label: string) => void;
    children: ReactNode;
  }) => ReactNode;
};

let components: Components;

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        export { default as KpiRow, KpiLabelProvider } from "./client/src/components/deck/KpiRow";
      `,
      resolveDir: path.resolve(import.meta.dirname, ".."),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    // The bundle must not carry its own React: the context the provider creates
    // has to be the one the renderer below reads, and two copies of React give
    // two unrelated contexts.
    external: ["react", "react-dom", "react/jsx-runtime"],
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

const ITEMS: KpiItem[] = [
  { label: "Total S35", value: "116" },
  { label: "Ratio por oficina", value: "0,06" },
];

function render(
  labels: Record<string, string>,
  editing: boolean,
  onRename: (key: string, label: string) => void = () => {}
): string {
  return renderToStaticMarkup(
    createElement(
      components.KpiLabelProvider,
      { editing, labels, onRename },
      createElement(components.KpiRow, { items: ITEMS })
    ) as never
  );
}

describe("KPI card titles", () => {
  it("prints the title the page computed when nothing was renamed", () => {
    const html = render({}, false);

    expect(html).toContain("Total S35");
    expect(html).toContain("Ratio por oficina");
  });

  it("prints the renamed title stored in the page slot", () => {
    const html = render({ kpi1: "Resueltas de la semana" }, false);

    expect(html).toContain("Resueltas de la semana");
    expect(html).not.toContain("Total S35");
    // Only the renamed card changes.
    expect(html).toContain("Ratio por oficina");
  });

  it("treats an emptied slot as the page's own title, not as a blank card", () => {
    const html = render({ kpi1: "" }, false);

    expect(html).toContain("Total S35");
  });

  it("offers a field per card while editing, with the computed title as placeholder", () => {
    const html = render({ kpi2: "Por oficina" }, true);

    expect(html).toContain('aria-label="Título de la tarjeta 1"');
    expect(html).toContain('aria-label="Título de la tarjeta 2"');
    expect(html).toContain('placeholder="Total S35"');
    expect(html).toContain('value="Por oficina"');
  });

  it("does not make the titles editable without a provider", () => {
    const html = renderToStaticMarkup(
      createElement(components.KpiRow, { items: ITEMS }) as never
    );

    expect(html).toContain("Total S35");
    expect(html).not.toContain("<input");
  });
});
