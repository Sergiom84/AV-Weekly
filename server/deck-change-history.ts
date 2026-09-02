import type { DeckPage } from "../shared/deck/core.ts";

export type DeckDepartment = "av" | "informatica" | "aga" | "oficinas";

export interface DeckChange {
  department: DeckDepartment;
  pageId: string;
  slideNumber: number | null;
  pageTitle: string;
  fieldKey: string;
  fieldLabel: string;
  previousValue: unknown;
  newValue: unknown;
}

type GenericPage = DeckPage<string, string> & Record<string, unknown>;

const TRACKED_FIELDS = [
  "text",
  "overrides",
  "visible",
  "weekSelection",
  "years",
  "hiddenRows",
  "images",
] as const;

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function visibleNumbers(pages: GenericPage[]): Map<string, number> {
  const result = new Map<string, number>();
  let number = 0;

  for (const page of pages) {
    if (page.visible === false) continue;
    number += 1;
    result.set(page.id, number);
  }

  return result;
}

function fieldLabel(path: string): string {
  if (path === "text.title") return "Título";
  if (path === "text.subtitle") return "Subtítulo";
  if (path === "text.footnote") return "Nota al pie";
  if (path === "text.body") return "Contenido";
  if (path === "visible") return "Visibilidad";
  if (path === "weekSelection") return "Rango semanal";
  if (path === "years") return "Años comparados";
  if (path === "hiddenRows") return "Filas ocultas";
  if (path === "images") return "Imágenes";

  if (path.startsWith("overrides.")) {
    return path
      .slice("overrides.".length)
      .replaceAll(":", " · ")
      .replaceAll("|", " · ");
  }

  if (path.startsWith("text.")) return path.slice("text.".length);
  return path;
}

function objectEntries(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function changedLeaves(
  field: (typeof TRACKED_FIELDS)[number],
  previous: unknown,
  next: unknown
): Array<{ path: string; previous: unknown; next: unknown }> {
  if (field !== "text" && field !== "overrides") {
    return sameValue(previous, next) ? [] : [{ path: field, previous, next }];
  }

  const before = objectEntries(previous);
  const after = objectEntries(next);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  return Array.from(keys)
    .filter(key => !sameValue(before[key], after[key]))
    .map(key => ({
      path: `${field}.${key}`,
      previous: before[key] ?? null,
      next: after[key] ?? null,
    }));
}

/** Server-side diff of user-editable deck fields, used by history and toasts. */
export function deckChanges(
  department: DeckDepartment,
  previousPages: GenericPage[],
  nextPages: GenericPage[]
): DeckChange[] {
  const previousById = new Map(previousPages.map(page => [page.id, page]));
  const previousNumbers = visibleNumbers(previousPages);
  const nextNumbers = visibleNumbers(nextPages);
  const changes: DeckChange[] = [];

  for (const page of nextPages) {
    const previous = previousById.get(page.id);
    if (!previous) continue;

    for (const field of TRACKED_FIELDS) {
      for (const change of changedLeaves(field, previous[field], page[field])) {
        changes.push({
          department,
          pageId: page.id,
          slideNumber:
            nextNumbers.get(page.id) ?? previousNumbers.get(page.id) ?? null,
          pageTitle:
            String(objectEntries(page.text).title ?? "") ||
            String(objectEntries(previous.text).title ?? "") ||
            page.id,
          fieldKey: change.path,
          fieldLabel: fieldLabel(change.path),
          previousValue: change.previous,
          newValue: change.next,
        });
      }
    }
  }

  return changes;
}
