import type {
  DeckPage,
  InformeWeeklyDataset,
  ResolutionTableRow,
  WeekSelection,
} from "@shared/informe";
import {
  calculateResolutionTableTotals,
  followLatestWeekSelection,
  resolutionCellKey,
  resolutionValueAt,
  reportedWeekAvailability,
  resolveWeekSelection,
} from "@shared/informe";
import EditableNumber from "@/components/deck/EditableNumber";
import EditableText from "@/components/deck/EditableText";
import SlideHeading from "@/components/deck/SlideHeading";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import { useFitTableScale } from "@/hooks/useFitTableScale";

interface ResolutionDetailPageProps {
  page: DeckPage;
  weekly: InformeWeeklyDataset;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
}

/** A row of the matrix: a hardware/software group and one of its resolutions. */
type ResolutionKey = ResolutionTableRow;

/**
 * Resolution detail slide: the hardware/software group and its resolution down
 * the left, one column per selected week, and a total column. Values come from
 * the weekly uploads accumulated week by week and can be typed in by hand.
 */
export default function ResolutionDetailPage({
  page,
  weekly,
  editing,
  onChange,
}: ResolutionDetailPageProps) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  const typeData = page.supportType
    ? weekly.byType[page.supportType]
    : undefined;
  const byWeek = typeData?.resolutionsByWeek ?? {};

  const heading = (
    <SlideHeading
      service={page.text.subtitle ?? ""}
      title={page.text.title ?? ""}
      editing={editing}
      onServiceChange={setSlot("subtitle")}
      onTitleChange={setSlot("title")}
    />
  );

  // Weeks come from the support matrix, so the page can show weeks that have no
  // detail imported yet and let them be filled in by hand.
  const matrix = typeData ? (typeData.categories ?? typeData.locations) : null;
  const allWeeks =
    matrix?.weeks ??
    Object.keys(byWeek)
      .map(Number)
      .sort((a, b) => a - b);
  const available = reportedWeekAvailability(
    allWeeks,
    Object.keys(byWeek).map(Number)
  );
  const hasData = available.length > 0;

  const selection: WeekSelection =
    page.weekSelection ?? followLatestWeekSelection();
  const weeks = hasData ? resolveWeekSelection(selection, available) : [];

  // Row set: every group and resolution seen in any imported week, plus the
  // ones the user has typed in manually.
  const seen = new Map<string, ResolutionKey>();

  for (const rows of Object.values(byWeek)) {
    for (const row of rows) {
      seen.set(`${row.tier2}|${row.tier3}`, {
        tier2: row.tier2,
        tier3: row.tier3,
      });
    }
  }

  for (const key of Object.keys(page.overrides)) {
    const [rowPart] = key.split(":");
    const [tier2, tier3] = rowPart.split("|");

    if (tier2 !== undefined && tier3 !== undefined && !seen.has(rowPart)) {
      seen.set(rowPart, { tier2, tier3 });
    }
  }

  const rows = Array.from(seen.values()).sort(
    (a, b) =>
      a.tier2.localeCompare(b.tier2, "es") ||
      a.tier3.localeCompare(b.tier3, "es")
  );

  // The row count varies a lot by support type (13 for presencial, 24+ for
  // incidencias/correctivos), and depends on whatever the source workbook
  // brings each month — never a fixed number this layout can assume. Rather
  // than guess a row count that fits, measure the table's actual rendered
  // height against the space it has and shrink font/padding just enough to
  // fit, so any department's data stays on one slide instead of scrolling or
  // spilling past the frame. `leading-none` trims the line-box overhead a
  // normal line-height would add, so more of the budget goes to the digits.
  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({
    deps: [rows.length, weeks.length],
  });

  if (!hasData) {
    return (
      <div className="@container flex h-full w-full flex-col text-foreground">
        {heading}
        <p className="mt-[2cqi] font-mono text-[1.3cqi] text-muted-foreground">
          Sin datos importados para este tipo de soporte
        </p>
      </div>
    );
  }

  const isOverridden = (row: ResolutionKey, week: number) =>
    Object.prototype.hasOwnProperty.call(
      page.overrides,
      resolutionCellKey(row, week)
    );

  const valueAt = (row: ResolutionKey, week: number): number | null =>
    resolutionValueAt(byWeek, page.overrides, row, week);

  const setCell = (row: ResolutionKey, week: number, value: number | null) =>
    onChange({
      overrides: { ...page.overrides, [resolutionCellKey(row, week)]: value },
    });

  const totals = calculateResolutionTableTotals(
    available,
    rows,
    byWeek,
    page.overrides
  );

  // Group rows so the hardware/software cell spans its resolutions, as in the
  // printed report.
  const groupSpan = new Map<string, number>();

  for (const row of rows) {
    groupSpan.set(row.tier2, (groupSpan.get(row.tier2) ?? 0) + 1);
  }

  const renderedGroups = new Set<string>();

  return (
    <div className="@container flex h-full w-full flex-col text-foreground">
      {heading}

      {editing && (
        <div className="mt-[1cqi] shrink-0">
          <WeekRangeSelector
            selection={selection}
            available={available}
            onChange={next => onChange({ weekSelection: next })}
          />
        </div>
      )}

      {/*
        The outer box stays flex-1 because the fit scale is measured against
        the height actually available; the frame lives on the inner wrapper so
        it hugs the table instead of drawing a border down to the slide's foot.
      */}
      <div
        ref={containerRef}
        className="mt-[1.5cqi] min-h-0 flex-1 overflow-auto"
      >
        <div className="overflow-hidden rounded-[0.4cqi] border border-border shadow-sm">
          <table
            ref={tableRef}
            className="w-full table-fixed border-collapse font-mono text-[length:calc(var(--fit-scale,1)*1.3cqi)] leading-none tabular-nums"
          >
            <thead>
              <tr className="bg-primary text-primary-foreground">
                <th
                  scope="col"
                  className="w-[9%] truncate px-[0.3cqi] py-[calc(var(--fit-scale,1)*0.42cqi)] text-left font-semibold tracking-wide"
                >
                  HARD\SOFT
                </th>
                <th
                  scope="col"
                  className="w-[13%] truncate px-[0.3cqi] py-[calc(var(--fit-scale,1)*0.42cqi)] text-left font-semibold tracking-wide"
                >
                  RESOLUCIÓN
                </th>
                {weeks.map(week => (
                  <th
                    key={week}
                    scope="col"
                    className="truncate px-[0.1cqi] py-[calc(var(--fit-scale,1)*0.42cqi)] text-center font-semibold"
                  >
                    {week}
                  </th>
                ))}
                <th
                  scope="col"
                  className="w-[6%] truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.42cqi)] text-center font-semibold tracking-wide"
                >
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const key = `${row.tier2}|${row.tier3}`;
                const showGroup = !renderedGroups.has(row.tier2);

                if (showGroup) {
                  renderedGroups.add(row.tier2);
                }

                const isLastOfGroup =
                  index === rows.length - 1 ||
                  rows[index + 1].tier2 !== row.tier2;
                const zebra = index % 2 === 1;

                return (
                  <tr
                    key={key}
                    className={
                      isLastOfGroup
                        ? "border-b border-border"
                        : "border-b border-border/40"
                    }
                  >
                    {showGroup && (
                      <th
                        scope="row"
                        rowSpan={groupSpan.get(row.tier2)}
                        className="truncate border-r border-border bg-muted/30 px-[0.3cqi] py-[calc(var(--fit-scale,1)*0.26cqi)] text-left align-middle font-semibold text-muted-foreground"
                      >
                        {row.tier2}
                      </th>
                    )}
                    <td
                      className={`truncate border-r border-border px-[0.3cqi] py-[calc(var(--fit-scale,1)*0.26cqi)] text-left ${zebra ? "bg-muted/15" : ""}`}
                    >
                      {row.tier3}
                    </td>
                    {weeks.map(week => (
                      <td
                        key={week}
                        className={`overflow-hidden px-[0.1cqi] py-[calc(var(--fit-scale,1)*0.26cqi)] text-center ${zebra ? "bg-muted/15" : ""}`}
                      >
                        <EditableNumber
                          value={valueAt(row, week)}
                          onChange={value => setCell(row, week, value)}
                          editing={editing}
                          overridden={isOverridden(row, week)}
                          ariaLabel={`${row.tier2} ${row.tier3} semana ${week}`}
                          className="text-[length:calc(var(--fit-scale,1)*1.3cqi)]"
                        />
                      </td>
                    ))}
                    <td className="truncate bg-muted/40 px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.26cqi)] text-center font-semibold">
                      {totals.rowTotals[key]}
                    </td>
                  </tr>
                );
              })}

              <tr className="bg-primary font-semibold text-primary-foreground">
                <th
                  scope="row"
                  colSpan={2}
                  className="truncate px-[0.3cqi] py-[calc(var(--fit-scale,1)*0.42cqi)] text-left tracking-wide"
                >
                  TOTAL
                </th>
                {weeks.map(week => (
                  <td
                    key={week}
                    className="truncate px-[0.1cqi] py-[calc(var(--fit-scale,1)*0.42cqi)] text-center"
                  >
                    {totals.weekTotals[String(week)] ?? 0}
                  </td>
                ))}
                <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.42cqi)] text-center">
                  {totals.grandTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-[1cqi] shrink-0 font-mono text-[1.15cqi] leading-snug text-muted-foreground">
        <EditableText
          value={page.text.footnote ?? ""}
          onChange={setSlot("footnote")}
          editing={editing}
          multiline
          ariaLabel="Nota al pie"
          className="block w-full"
        />
      </p>
    </div>
  );
}
