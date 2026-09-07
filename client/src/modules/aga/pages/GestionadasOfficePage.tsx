import {
  MONTH_LABELS,
  defaultMonthWindow,
  resolveMonthSelection,
} from "@shared/deck/core";
import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import type { AgaDataset } from "@shared/modules/aga/types";
import { agaColor } from "../aggregate";
import {
  cellKey,
  isOverridden,
  overriddenValue,
  withOverride,
} from "../overrides";
import PageShell, { type AgaPageProps } from "./PageShell";
import SeriesLineChart, {
  type LineSeries,
} from "@/components/deck/SeriesLineChart";
import ValueGrid from "./AgaValueGrid";

interface GestionadasOfficePageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/** `2026-08` renders as `Ago 26`, the form the Informática deck already uses. */
function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7));
  const name = MONTH_LABELS[index - 1] ?? month;

  return `${name} ${month.slice(2, 4)}`;
}

/**
 * `2.8 Office`: one line per licence family over the reported months.
 *
 * A month with no value for a family is drawn as a gap — see `SeriesLineChart`.
 */
export default function GestionadasOfficePage({
  page,
  editing,
  onChange,
  dataset,
}: GestionadasOfficePageProps) {
  const availableMonths = dataset.office?.months ?? [];
  const monthSelection = page.monthSelection ?? defaultMonthWindow(12);
  const months = resolveMonthSelection(monthSelection, availableMonths);
  const families = dataset.office?.families ?? [];
  const labels = families.map(family => family.label);
  const hiddenRows = page.hiddenRows ?? [];
  const visibleFamilies = families.filter(
    family => !hiddenRows.includes(family.label)
  );

  const entries = visibleFamilies.map((family, index) => ({
    label: family.label,
    key: `f${index}`,
    color: agaColor(index),
    cells: months.map(month => {
      const position = availableMonths.indexOf(month);
      const key = cellKey(family.label, month);

      return {
        key,
        value: overriddenValue(page, key, family.values[position] ?? null),
        overridden: isOverridden(page, key),
      };
    }),
  }));

  const series: LineSeries[] = entries.map(entry => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
  }));

  const data = months.map((month, position) => {
    const row: Record<string, number | string | null> = {
      mes: monthLabel(month),
    };

    for (const entry of entries) {
      row[entry.key] = entry.cells[position].value;
    }

    return row;
  });

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        <>
          {editing && (
            <MonthRangeSelector
              selection={monthSelection}
              available={availableMonths}
              format={monthLabel}
              onChange={monthSelection => onChange({ monthSelection })}
            />
          )}

          {editing && (
            <RowFilterPanel
              labels={labels}
              hiddenRows={hiddenRows}
              scope={page.id}
              defaultHidden={[]}
              onChange={hiddenRows => onChange({ hiddenRows })}
            />
          )}

          {editing && (
            <ValueGrid
              columns={months.map(monthLabel)}
              rows={entries.map(entry => ({
                label: entry.label,
                color: entry.color,
                cells: entry.cells,
              }))}
              onChange={(key, value) =>
                onChange(withOverride(page, key, value))
              }
            />
          )}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <SeriesLineChart categoryKey="mes" series={series} data={data} />
      </div>
    </PageShell>
  );
}
