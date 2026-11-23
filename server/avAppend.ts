/**
 * Append-only merge for the AV texto upload.
 *
 * Every upload of the Drive TXT carries the whole year, rebuilt from a template
 * that is sometimes incomplete or wrong. What is already stored stays as it is:
 * an upload only adds the weeks, months and resolution weeks that were missing.
 * A week counts as stored when its column has at least one ticket, so the zero
 * columns that densifying inserts for missing weeks can still be filled later.
 */
import { isoWeekBounds, type WeeklyMatrix } from "../shared/deck/core.ts";
import { INFORME_SUPPORT_TYPES, type SupportType } from "../shared/informe.ts";
import type {
  InformeMonthlyDataset,
  InformeWeeklyDataset,
  ResolutionRow,
} from "../shared/modules/av/types.ts";
import { densifyWeeklyMatrix } from "./parseInformeWeekly.ts";

type ResolutionWeeks = Record<SupportType, Record<string, ResolutionRow[]>>;

function weekValues(matrix: WeeklyMatrix, week: number): Map<string, number> | null {
  const index = matrix.weeks.indexOf(week);
  if (index === -1) return null;

  const values = new Map<string, number>();
  let total = 0;
  for (const row of matrix.rows) {
    const value = row.values[index] ?? 0;
    values.set(row.label, value);
    total += value;
  }
  return total > 0 ? values : null;
}

/** Stored weeks with tickets win; incoming weeks only fill the rest. */
export function appendWeeklyMatrix(
  stored: WeeklyMatrix | null,
  incoming: WeeklyMatrix | null
): WeeklyMatrix | null {
  if (!stored) return incoming;
  if (!incoming) return stored;

  const weeks = Array.from(new Set([...stored.weeks, ...incoming.weeks])).sort(
    (left, right) => left - right
  );
  const labels: string[] = [];
  for (const row of [...stored.rows, ...incoming.rows]) {
    if (!labels.includes(row.label)) labels.push(row.label);
  }

  const columns = weeks.map(
    (week) => weekValues(stored, week) ?? weekValues(incoming, week) ?? new Map<string, number>()
  );
  const rows = labels.map((label) => {
    const values = columns.map((column) => column.get(label) ?? 0);
    return { label, values, total: values.reduce((sum, value) => sum + value, 0) };
  });
  const totals = weeks.map((_, index) =>
    rows.reduce((sum, row) => sum + (row.values[index] ?? 0), 0)
  );

  return densifyWeeklyMatrix({ weeks, rows, totals });
}

/** A different year starts from scratch; the same year only adds weeks. */
export function appendWeeklyDataset(
  stored: InformeWeeklyDataset | null,
  incoming: InformeWeeklyDataset
): InformeWeeklyDataset {
  if (!stored || (stored.year && incoming.year && stored.year !== incoming.year)) {
    return incoming;
  }

  const byType = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => {
      const previous = stored.byType[type];
      const next = incoming.byType[type];
      return [
        type,
        {
          ...next,
          categories: appendWeeklyMatrix(previous?.categories ?? null, next.categories),
          locations: appendWeeklyMatrix(previous?.locations ?? null, next.locations),
        },
      ];
    })
  ) as InformeWeeklyDataset["byType"];

  return {
    ...incoming,
    byType,
    year: incoming.year ?? stored.year,
    maxWeek: Math.max(stored.maxWeek, incoming.maxWeek),
  };
}

/** Keeps every stored resolution week that has rows; adds the missing ones. */
export function appendResolutionWeeks(
  stored: Partial<ResolutionWeeks> | undefined,
  incoming: ResolutionWeeks
): ResolutionWeeks {
  return Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => {
      const merged = { ...(incoming[type] ?? {}) };
      for (const [week, rows] of Object.entries(stored?.[type] ?? {})) {
        if (rows.length > 0) merged[week] = rows;
      }
      return [type, merged];
    })
  ) as ResolutionWeeks;
}

/** Stored months keep their value; incoming values only fill empty months. */
export function appendMonthlyDataset(
  stored: InformeMonthlyDataset,
  incoming: InformeMonthlyDataset
): InformeMonthlyDataset {
  const byType = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => {
      const years = { ...(stored.byType[type] ?? {}) };
      for (const [year, months] of Object.entries(incoming.byType[type] ?? {})) {
        const previous = years[year] ?? [];
        years[year] = months.map((value, index) => previous[index] ?? value);
      }
      return [type, years];
    })
  ) as InformeMonthlyDataset["byType"];

  const years = Array.from(
    new Set(INFORME_SUPPORT_TYPES.flatMap((type) => Object.keys(byType[type]).map(Number)))
  ).sort((left, right) => left - right);

  return {
    byType,
    years,
    sourceFile: incoming.sourceFile ?? stored.sourceFile,
    uploadedAt: incoming.uploadedAt ?? stored.uploadedAt,
    territoriales: incoming.territoriales ?? stored.territoriales ?? null,
  };
}

/** Slices a weekly matrix down to `weeks <= maxWeek` and recomputes row/column totals. */
export function sliceWeeklyMatrixToWeek(
  matrix: WeeklyMatrix | null,
  maxWeek: number
): WeeklyMatrix | null {
  if (!matrix) return null;

  const indices: number[] = [];
  for (let i = 0; i < matrix.weeks.length; i += 1) {
    if (matrix.weeks[i] <= maxWeek) {
      indices.push(i);
    }
  }
  if (indices.length === 0) return null;

  const weeks = indices.map((i) => matrix.weeks[i]);
  const rows = matrix.rows.map((row) => {
    const values = indices.map((i) => row.values[i] ?? 0);
    return {
      label: row.label,
      values,
      total: values.reduce((sum, value) => sum + value, 0),
    };
  });
  const totals = weeks.map((_, index) =>
    rows.reduce((sum, row) => sum + (row.values[index] ?? 0), 0)
  );

  return { weeks, rows, totals };
}

/** Projects a stored weekly dataset down to `activeWeek` without modifying storage. */
export function projectAvWeeklyToWeek(
  weekly: InformeWeeklyDataset,
  activeWeek?: number
): InformeWeeklyDataset {
  if (!activeWeek || activeWeek <= 0 || activeWeek >= weekly.maxWeek) {
    return weekly;
  }

  const byType = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => {
      const data = weekly.byType[type];
      const resolutionsByWeek = Object.fromEntries(
        Object.entries(data.resolutionsByWeek).filter(
          ([weekKey]) => Number(weekKey) <= activeWeek
        )
      );
      return [
        type,
        {
          ...data,
          categories: sliceWeeklyMatrixToWeek(data.categories, activeWeek),
          locations: sliceWeeklyMatrixToWeek(data.locations, activeWeek),
          resolutionsByWeek,
        },
      ];
    })
  ) as InformeWeeklyDataset["byType"];

  return {
    ...weekly,
    byType,
    maxWeek: activeWeek,
  };
}

/** Projects a stored monthly dataset down to the cutoff month of `activeWeek`. */
export function projectAvMonthlyToWeek(
  monthly: InformeMonthlyDataset,
  year: string | undefined,
  activeWeek: number | undefined,
  storedMaxWeek: number
): InformeMonthlyDataset {
  const { activeMonthlyOverride: storedOverride, ...baseMonthly } = monthly;
  const numericYear = Number(year);

  if (
    !activeWeek ||
    activeWeek <= 0 ||
    activeWeek >= storedMaxWeek ||
    !year ||
    !Number.isInteger(numericYear)
  ) {
    return baseMonthly;
  }

  const weekEnd = isoWeekBounds(numericYear, activeWeek).end;
  const cutoffMonth =
    Number(weekEnd.slice(0, 4)) > numericYear
      ? 11
      : Number(weekEnd.slice(5, 7)) - 1;

  const override =
    storedOverride &&
    storedOverride.week === activeWeek &&
    storedOverride.year === year
      ? storedOverride
      : null;

  const byType = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => {
      const storedYears = monthly.byType[type] ?? {};
      const nextYears: Record<string, (number | null)[]> = {};

      for (const [yearKey, values] of Object.entries(storedYears)) {
        const y = Number(yearKey);
        if (y < numericYear) {
          nextYears[yearKey] = values;
        }
      }

      const storedCurrent = storedYears[year];
      const overrideCurrent = override?.byType[type]?.[year];
      if (storedCurrent || overrideCurrent) {
        nextYears[year] = Array.from({ length: 12 }, (_, index) => {
          if (index > cutoffMonth) return null;
          if (index === cutoffMonth) {
            return overrideCurrent?.[index] ?? storedCurrent?.[index] ?? null;
          }
          return storedCurrent?.[index] ?? overrideCurrent?.[index] ?? null;
        });
      }

      return [type, nextYears];
    })
  ) as InformeMonthlyDataset["byType"];

  const yearsSet = new Set<number>();
  for (const type of INFORME_SUPPORT_TYPES) {
    for (const [yearKey, values] of Object.entries(byType[type])) {
      if (values.some((value) => value !== null && value !== undefined)) {
        yearsSet.add(Number(yearKey));
      }
    }
  }
  const years = Array.from(yearsSet).sort((left, right) => left - right);

  return {
    ...baseMonthly,
    byType,
    years,
    territoriales: override?.territoriales ?? baseMonthly.territoriales ?? null,
  };
}
