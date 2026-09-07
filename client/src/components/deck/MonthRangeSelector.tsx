import { resolveMonthSelection, type MonthSelection } from "@shared/deck/core";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MonthRangeSelectorProps {
  selection: MonthSelection;
  available: string[];
  format: (month: string) => string;
  onChange: (selection: MonthSelection) => void;
  /**
   * Trailing-window presets (`Últimos 12/18 meses`). Year-on-year charts that
   * filter by calendar-month index leave this off: those buttons would not
   * mean a trailing window of `YYYY-MM` rows.
   */
  windows?: boolean;
}

/** Compact period filter for monthly charts. */
export default function MonthRangeSelector({
  selection,
  available,
  format,
  onChange,
  windows = true,
}: MonthRangeSelectorProps) {
  if (available.length === 0) return null;

  const first = available[0];
  const last = available[available.length - 1];
  const resolved = resolveMonthSelection(selection, available);
  const displayFrom = selection.mode === "window" ? (resolved[0] ?? first) : selection.from;
  const displayTo = selection.mode === "window" ? (resolved.at(-1) ?? last) : selection.to;
  const allSelected = selection.mode === "range" &&
    selection.from <= first && selection.to >= last;
  const last12Selected = selection.mode === "window" && (selection.size ?? 12) === 12;
  const last18Selected = selection.mode === "window" && selection.size === 18;
  const setRange = (from: string, to: string) =>
    onChange({
      mode: "range",
      from: from < to ? from : to,
      to: from < to ? to : from,
      months: [],
    });

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
      <div className="flex items-center gap-1">
        <Select
          value={displayFrom}
          onValueChange={month => setRange(month, displayTo)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Mes inicial"
            className="h-7 w-24 font-mono text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {available.map(month => (
              <SelectItem
                key={month}
                value={month}
                className="font-mono text-xs"
              >
                {format(month)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span aria-hidden="true" className="text-muted-foreground">
          —
        </span>
        <Select
          value={displayTo}
          onValueChange={month => setRange(displayFrom, month)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Mes final"
            className="h-7 w-24 font-mono text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {available.map(month => (
              <SelectItem
                key={month}
                value={month}
                className="font-mono text-xs"
              >
                {format(month)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={allSelected ? "default" : "outline"}
          aria-pressed={allSelected}
          className="h-7 px-2 font-mono text-xs"
          onClick={() => setRange(first, last)}
        >
          Todos
        </Button>
        {windows && (
          <>
            <Button
              type="button"
              size="sm"
              variant={last12Selected ? "default" : "outline"}
              aria-pressed={last12Selected}
              className="h-7 px-2 font-mono text-xs"
              onClick={() =>
                onChange({
                  mode: "window",
                  from: first,
                  to: last,
                  months: [],
                  size: 12,
                })
              }
            >
              Últimos 12 meses
            </Button>
            <Button
              type="button"
              size="sm"
              variant={last18Selected ? "default" : "outline"}
              aria-pressed={last18Selected}
              className="h-7 px-2 font-mono text-xs"
              onClick={() =>
                onChange({
                  mode: "window",
                  from: first,
                  to: last,
                  months: [],
                  size: 18,
                })
              }
            >
              Últimos 18 meses
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
