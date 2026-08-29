import type { WeekSelection } from "@shared/informe";
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
}

export default function WeekRangeSelector({
  selection,
  available,
  onChange,
  disabled,
}: WeekRangeSelectorProps) {
  if (available.length === 0) {
    return null;
  }

  const first = available[0];
  const last = available[available.length - 1];

  const setRange = (from: number, to: number) => {
    onChange({
      mode: "range",
      from: Math.min(from, to),
      to: Math.max(from, to),
      weeks: [],
    });
  };

  const setWindow = (size: number) => {
    onChange({ mode: "window", from: first, to: last, weeks: [], size });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
      <div className="flex items-center gap-1">
        <Select
          disabled={disabled}
          value={String(selection.from)}
          onValueChange={value => setRange(Number(value), selection.to)}
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
                {`S${week}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span aria-hidden="true" className="text-muted-foreground">
          —
        </span>
        <Select
          disabled={disabled}
          value={String(selection.to)}
          onValueChange={value => setRange(selection.from, Number(value))}
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
                {`S${week}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 font-mono text-xs"
          disabled={disabled}
          onClick={() => setRange(first, last)}
        >
          Todas
        </Button>
        <Button
          type="button"
          size="sm"
          variant={selection.mode === "window" ? "default" : "outline"}
          className="h-7 px-2 font-mono text-xs"
          disabled={disabled}
          onClick={() => setWindow(20)}
        >
          Últimas 20 semanas
        </Button>
      </div>
    </div>
  );
}
