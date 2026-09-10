import { createContext, useContext, type ReactNode } from "react";
import EditableText from "@/components/deck/EditableText";

export interface KpiItem {
  label: string;
  value: string;
  /** Year or series colour, drawn as the left rule of the card. */
  accent?: string;
}

/** Lift used by Oficinas KPI cards and reused on Informática summaries. */
export const KPI_CARD_HOVER =
  "transition-[transform,box-shadow,border-color,background-color] duration-150 ease-out hover:-translate-y-[0.1cqi] hover:scale-[1.015] hover:border-primary/30 hover:bg-primary/[0.03] hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100";

interface KpiLabelEditing {
  editing: boolean;
  /** Renamed card titles of the page, by slot key. */
  labels: Record<string, string>;
  onRename: (key: string, label: string) => void;
}

const KpiLabelContext = createContext<KpiLabelEditing | null>(null);

/**
 * Makes the card titles of the slides below editable and persisted.
 *
 * A page shell provides it once and every `KpiRow` under it picks it up, so a
 * page does not have to wire its own cards: the titles are computed inside each
 * page, from the period or the metric, and the rename is a text slot of the
 * page like the heading and the footnote are.
 *
 * The slot key is the position of the card in its row (`kpi1`, `kpi2`, ...),
 * not the title it shipped with. A title carries the period it belongs to
 * ("Total 2026", "Total S35"), so keying by text would drop the rename the week
 * the period moves on — which is every week. The cost is that a page that
 * reorders or adds cards moves the renames with the slot; those rows are fixed
 * per page, and the alternative loses the rename far more often.
 */
export function KpiLabelProvider({
  editing,
  labels,
  onRename,
  children,
}: KpiLabelEditing & { children: ReactNode }) {
  return (
    <KpiLabelContext.Provider value={{ editing, labels, onRename }}>
      {children}
    </KpiLabelContext.Provider>
  );
}

/** Slot key of the card in position `index` of its row. */
export function kpiLabelKey(index: number): string {
  return `kpi${index + 1}`;
}

interface KpiRowProps {
  items: KpiItem[];
  compact?: boolean;
}

/** Row of headline figures, as the boxed KPIs of the printed report. */
export default function KpiRow({ items, compact = false }: KpiRowProps) {
  const renaming = useContext(KpiLabelContext);

  if (items.length === 0) {
    return null;
  }

  return (
    <ul className={`flex shrink-0 ${compact ? "gap-[0.7cqi]" : "gap-[1.2cqi]"}`}>
      {items.map((item, index) => {
        const key = kpiLabelKey(index);
        // An empty rename is not a blank card title, it is the page's own one
        // back: clearing the box is how a title is un-renamed.
        const label = renaming?.labels[key] || item.label;
        const labelClass = `font-mono uppercase tracking-wide text-muted-foreground ${compact ? "text-[0.95cqi]" : "text-[1.1cqi]"}`;

        return (
          <li
            key={item.label}
            className={`relative flex flex-1 flex-col justify-center rounded-md border border-border ${KPI_CARD_HOVER} ${
              compact
                ? "px-[0.9cqi] py-[0.55cqi] text-center"
                : "px-[1.4cqi] py-[1cqi] text-center"
            }`}
          >
            {item.accent ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-[0.32cqi] rounded-l-md"
                style={{ backgroundColor: item.accent }}
              />
            ) : null}
            {renaming?.editing ? (
              <EditableText
                value={renaming.labels[key] ?? ""}
                onChange={value => renaming.onRename(key, value)}
                editing
                placeholder={item.label}
                ariaLabel={`Título de la tarjeta ${index + 1}`}
                className={`${labelClass} text-center`}
              />
            ) : (
              <p className={labelClass}>{label}</p>
            )}
            <p className={`font-mono tabular-nums text-foreground ${compact ? "mt-[0.15cqi] text-[1.9cqi]" : "mt-[0.4cqi] text-[2.4cqi]"}`}>
              {item.value}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
