import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import type { AgaDataset } from "@shared/modules/aga/types";
import { agaColor, variationLabel, weekLabel } from "../aggregate";
import {
  TOTAL_ROW,
  cellKey,
  isOverridden,
  overriddenValue,
  withOverride,
} from "../overrides";
import PageShell, { type AgaPageProps } from "./PageShell";
import ValueGrid from "@/components/deck/ValueGrid";

interface GestionadasTotalPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

const SERIES: CategorySeries[] = [
  { key: "total", label: "Posiciones gestionadas", color: agaColor(0) },
];

/**
 * `2.1 Total posiciones gestionadas por semana`: one column per reported week.
 *
 * The variation is read on the standard base, `(actual − previa) / previa`, the
 * same one slide 1.1 uses. `managedWeeklyDelta` also exposes the inverse base
 * because the presented pptx states a figure neither base reproduces exactly;
 * that figure is typed by hand in the deck and is not adopted here — a headline
 * that disagrees with the bars above it is worse than one that differs from the
 * printed copy.
 */
export default function GestionadasTotalPage({
  page,
  editing,
  onChange,
  dataset,
}: GestionadasTotalPageProps) {
  const totals = dataset.managed?.weeklyTotals ?? [];

  const entries = totals.map((entry) => {
    const key = cellKey(TOTAL_ROW, entry.week);

    return {
      week: entry.week,
      key,
      value: overriddenValue(page, key, entry.total),
      overridden: isOverridden(page, key),
    };
  });

  const data = entries.map((entry) => ({
    semana: weekLabel(entry.week),
    total: entry.value ?? 0,
  }));

  const previous = entries[entries.length - 2] ?? null;
  const current = entries[entries.length - 1] ?? null;

  const items = [
    ...(previous
      ? [
          {
            label: weekLabel(previous.week),
            value: (previous.value ?? 0).toLocaleString("es-ES"),
          },
        ]
      : []),
    ...(current
      ? [
          {
            label: weekLabel(current.week),
            value: (current.value ?? 0).toLocaleString("es-ES"),
          },
        ]
      : []),
    {
      label: "Variación",
      value: variationLabel(previous?.value ?? null, current?.value ?? null),
    },
  ];

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow items={items} />

      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart categoryKey="semana" series={SERIES} data={data} />
      </div>

      {editing && (
        <ValueGrid
          columns={entries.map((entry) => weekLabel(entry.week))}
          rows={[
            {
              label: "Gestionadas",
              color: agaColor(0),
              cells: entries.map((entry) => ({
                key: entry.key,
                value: entry.value,
                overridden: entry.overridden,
              })),
            },
          ]}
          onChange={(key, value) => onChange(withOverride(page, key, value))}
        />
      )}
    </PageShell>
  );
}
