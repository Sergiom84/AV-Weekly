import type { DeckPage, InformeWeeklyDataset, WeekSelection } from "@shared/informe";
import { defaultWeekSelection, resolveWeekSelection } from "@shared/informe";
import EditableNumber from "./EditableNumber";
import EditableText from "./EditableText";
import SlideHeading from "./SlideHeading";
import WeekRangeSelector from "./WeekRangeSelector";

interface ResolutionDetailPageProps {
  page: DeckPage;
  weekly: InformeWeeklyDataset;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
}

/** A row of the matrix: a hardware/software group and one of its resolutions. */
interface ResolutionKey {
  tier2: string;
  tier3: string;
}

const cellKey = (row: ResolutionKey, week: number) =>
  `${row.tier2}|${row.tier3}:${week}`;

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

  const typeData = page.supportType ? weekly.byType[page.supportType] : undefined;
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
  const available = matrix?.weeks ?? Object.keys(byWeek).map(Number).sort((a, b) => a - b);

  if (available.length === 0) {
    return (
      <div className="@container flex h-full w-full flex-col text-foreground">
        {heading}
        <p className="mt-[2cqi] font-mono text-[1.3cqi] text-muted-foreground">
          Sin datos importados para este tipo de soporte
        </p>
      </div>
    );
  }

  const selection: WeekSelection =
    page.weekSelection ?? defaultWeekSelection(available[available.length - 1]);
  const weeks = resolveWeekSelection(selection, available);

  // Row set: every group and resolution seen in any imported week, plus the
  // ones the user has typed in manually.
  const seen = new Map<string, ResolutionKey>();

  for (const rows of Object.values(byWeek)) {
    for (const row of rows) {
      seen.set(`${row.tier2}|${row.tier3}`, { tier2: row.tier2, tier3: row.tier3 });
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
    (a, b) => a.tier2.localeCompare(b.tier2, "es") || a.tier3.localeCompare(b.tier3, "es")
  );

  const isOverridden = (row: ResolutionKey, week: number) =>
    Object.prototype.hasOwnProperty.call(page.overrides, cellKey(row, week));

  const valueAt = (row: ResolutionKey, week: number): number | null => {
    if (isOverridden(row, week)) {
      return page.overrides[cellKey(row, week)];
    }

    const imported = byWeek[String(week)];

    if (!imported) {
      return null;
    }

    const match = imported.find(
      (entry) => entry.tier2 === row.tier2 && entry.tier3 === row.tier3
    );

    return match ? match.total : null;
  };

  const setCell = (row: ResolutionKey, week: number, value: number | null) =>
    onChange({ overrides: { ...page.overrides, [cellKey(row, week)]: value } });

  const rowTotal = (row: ResolutionKey) =>
    weeks.reduce((sum, week) => sum + (valueAt(row, week) ?? 0), 0);

  const weekTotal = (week: number) =>
    rows.reduce((sum, row) => sum + (valueAt(row, week) ?? 0), 0);

  const grandTotal = weeks.reduce((sum, week) => sum + weekTotal(week), 0);

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
            onChange={(next) => onChange({ weekSelection: next })}
          />
        </div>
      )}

      <div className="mt-[1.5cqi] min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse font-mono text-[1.05cqi] tabular-nums">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th scope="col" className="w-[9%] px-[0.3cqi] py-[0.4cqi] text-left font-normal">
                HARD\SOFT
              </th>
              <th scope="col" className="w-[13%] px-[0.3cqi] py-[0.4cqi] text-left font-normal">
                RESOLUCIÓN
              </th>
              {weeks.map((week) => (
                <th key={week} scope="col" className="px-[0.1cqi] py-[0.4cqi] text-center font-normal">
                  {week}
                </th>
              ))}
              <th scope="col" className="w-[6%] px-[0.2cqi] py-[0.4cqi] text-center font-normal">
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = `${row.tier2}|${row.tier3}`;
              const showGroup = !renderedGroups.has(row.tier2);

              if (showGroup) {
                renderedGroups.add(row.tier2);
              }

              return (
                <tr key={key} className="border-b border-border/60">
                  {showGroup && (
                    <th
                      scope="row"
                      rowSpan={groupSpan.get(row.tier2)}
                      className="border-r border-border px-[0.3cqi] py-[0.25cqi] text-left align-middle font-normal text-muted-foreground"
                    >
                      {row.tier2}
                    </th>
                  )}
                  <td className="border-r border-border px-[0.3cqi] py-[0.25cqi] text-left">
                    {row.tier3}
                  </td>
                  {weeks.map((week) => (
                    <td key={week} className="px-[0.1cqi] py-[0.25cqi] text-center">
                      <EditableNumber
                        value={valueAt(row, week)}
                        onChange={(value) => setCell(row, week, value)}
                        editing={editing}
                        overridden={isOverridden(row, week)}
                        ariaLabel={`${row.tier2} ${row.tier3} semana ${week}`}
                        className="text-[1.05cqi]"
                      />
                    </td>
                  ))}
                  <td className="bg-muted/40 px-[0.2cqi] py-[0.25cqi] text-center font-medium">
                    {rowTotal(row) || ""}
                  </td>
                </tr>
              );
            })}

            <tr className="bg-primary font-medium text-primary-foreground">
              <th scope="row" colSpan={2} className="px-[0.3cqi] py-[0.4cqi] text-left">
                TOTAL
              </th>
              {weeks.map((week) => (
                <td key={week} className="px-[0.1cqi] py-[0.4cqi] text-center">
                  {weekTotal(week) || ""}
                </td>
              ))}
              <td className="px-[0.2cqi] py-[0.4cqi] text-center">{grandTotal || ""}</td>
            </tr>
          </tbody>
        </table>
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
