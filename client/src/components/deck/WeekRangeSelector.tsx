import type { WeekSelection } from "@shared/informe";
import {
  ALL_REPORTED_WEEKS_WINDOW,
  followLatestWeekSelection,
  resolveWeekSelection,
  TRAILING_WEEK_WINDOW,
} from "@shared/informe";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WeekRangeSelectorProps {
  selection: WeekSelection;
  available: number[];
  onChange: (selection: WeekSelection) => void;
  disabled?: boolean;
  format?: (week: number) => string;
}

export default function WeekRangeSelector({
  selection,
  available,
  onChange,
  disabled,
  format = week => `S${week}`,
}: WeekRangeSelectorProps) {
  if (available.length === 0) {
    return null;
  }

  const first = available[0];
  const last = available[available.length - 1];
  const resolved = resolveWeekSelection(selection, available);
  const displayFrom =
    selection.mode === "window" ? (resolved[0] ?? first) : selection.from;
  const displayTo =
    selection.mode === "window"
      ? (resolved[resolved.length - 1] ?? last)
      : selection.to;

  const setRange = (from: number, to: number) => {
    onChange({
      mode: "range",
      from: Math.min(from, to),
      to: Math.max(from, to),
      weeks: [],
    });
  };

  const setWindow = (size: number) => {
    onChange(followLatestWeekSelection(size));
  };

  const followsAll =
    selection.mode === "window" &&
    (selection.size ?? TRAILING_WEEK_WINDOW) >= ALL_REPORTED_WEEKS_WINDOW;
  const followsTrailing =
    selection.mode === "window" &&
    (selection.size ?? TRAILING_WEEK_WINDOW) === TRAILING_WEEK_WINDOW;

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
      <div className="flex items-center gap-1">
        <Select
          disabled={disabled}
          value={String(displayFrom)}
          onValueChange={value => setRange(Number(value), displayTo)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Semana inicial"
            className="h-7 w-20 font-mono text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {available.map(week => (
              <SelectItem
                key={week}
                value={String(week)}
                className="font-mono text-xs"
              >
                {format(week)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span aria-hidden="true" className="text-muted-foreground">
          —
        </span>
        <Select
          disabled={disabled}
          value={String(displayTo)}
          onValueChange={value => setRange(displayFrom, Number(value))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Semana final"
            className="h-7 w-20 font-mono text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {available.map(week => (
              <SelectItem
                key={week}
                value={String(week)}
                className="font-mono text-xs"
              >
                {format(week)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={followsAll ? "default" : "outline"}
          aria-pressed={followsAll}
          className="h-7 px-2 font-mono text-xs"
          disabled={disabled}
          onClick={() => setWindow(ALL_REPORTED_WEEKS_WINDOW)}
        >
          Todas
        </Button>
        <Button
          type="button"
          size="sm"
          variant={followsTrailing && !followsAll ? "default" : "outline"}
          aria-pressed={followsTrailing && !followsAll}
          className="h-7 px-2 font-mono text-xs"
          disabled={disabled}
          onClick={() => setWindow(TRAILING_WEEK_WINDOW)}
        >
          Últimas 20 semanas
        </Button>
      </div>
    </div>
  );
}
