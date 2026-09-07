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

/** A trailing window offered as a button, so a saved range can be undone. */
interface WeekFollowOption {
  size: number;
  label: string;
}

/**
 * The windows every week axis offers: the whole reported year and the last
 * twenty. A page that charts a fixed number of weeks passes its own.
 */
const DEFAULT_FOLLOWS: WeekFollowOption[] = [
  { size: ALL_REPORTED_WEEKS_WINDOW, label: "Todas" },
  { size: TRAILING_WEEK_WINDOW, label: "Últimas 20 semanas" },
];

interface WeekRangeSelectorProps {
  selection: WeekSelection;
  available: number[];
  onChange: (selection: WeekSelection) => void;
  disabled?: boolean;
  format?: (week: number) => string;
  follows?: WeekFollowOption[];
}

export default function WeekRangeSelector({
  selection,
  available,
  onChange,
  disabled,
  format = week => `S${week}`,
  follows = DEFAULT_FOLLOWS,
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

  const followsSize = (size: number) =>
    selection.mode === "window" &&
    (selection.size ?? TRAILING_WEEK_WINDOW) === size;

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
        {follows.map(option => (
          <Button
            key={option.size}
            type="button"
            size="sm"
            variant={followsSize(option.size) ? "default" : "outline"}
            aria-pressed={followsSize(option.size)}
            className="h-7 px-2 font-mono text-xs"
            disabled={disabled}
            onClick={() => setWindow(option.size)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
