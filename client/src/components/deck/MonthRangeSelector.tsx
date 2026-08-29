import type { MonthSelection } from "@shared/deck/core";
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
}

/** Compact period filter for monthly charts. */
export default function MonthRangeSelector({
  selection,
  available,
  format,
  onChange,
}: MonthRangeSelectorProps) {
  if (available.length === 0) return null;

  const first = available[0];
  const last = available[available.length - 1];
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
          value={selection.from}
          onValueChange={month => setRange(month, selection.to)}
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
          value={selection.to}
          onValueChange={month => setRange(selection.from, month)}
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
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 font-mono text-xs"
          onClick={() => setRange(first, last)}
        >
          Todos
        </Button>
        <Button
          type="button"
          size="sm"
          variant={selection.mode === "window" ? "default" : "outline"}
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
      </div>
    </div>
  );
}
