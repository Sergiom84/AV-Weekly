import { useEffect, useState } from "react";
import type { WeekSelection } from "@shared/informe";
import { resolveWeekSelection } from "@shared/informe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface WeekRangeSelectorProps {
  selection: WeekSelection;
  available: number[];
  onChange: (selection: WeekSelection) => void;
  disabled?: boolean;
}

/**
 * Parses a free-form week expression such as "5, 11, 46", "5-28" or
 * "1-4, 11, 20-22" into the ordered list of weeks it denotes, restricted to
 * `available`. Returns null when the expression is empty, malformed, uses a
 * descending range, or resolves to no available week.
 */
export function parseWeekExpression(input: string, available: number[]): number[] | null {
  const tokens = input
    .split(/[,;]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  const collected: number[] = [];
  const seen = new Set<number>();

  const push = (week: number) => {
    if (seen.has(week)) {
      return;
    }
    seen.add(week);
    collected.push(week);
  };

  for (const token of tokens) {
    const single = /^(\d+)$/.exec(token);
    if (single) {
      push(Number(single[1]));
      continue;
    }

    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    if (!range) {
      return null;
    }

    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from > to) {
      return null;
    }

    for (let week = from; week <= to; week += 1) {
      push(week);
    }
  }

  const resolved = collected.filter((week) => available.includes(week));
  return resolved.length > 0 ? resolved : null;
}

function expressionFor(selection: WeekSelection, available: number[]): string {
  if (selection.mode === "list" && selection.weeks.length > 0) {
    return selection.weeks.join(", ");
  }

  const weeks = resolveWeekSelection(selection, available);
  return weeks.join(", ");
}

export default function WeekRangeSelector({
  selection,
  available,
  onChange,
  disabled,
}: WeekRangeSelectorProps) {
  const [draft, setDraft] = useState(() => expressionFor(selection, available));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(expressionFor(selection, available));
    setInvalid(false);
  }, [selection, available]);

  if (available.length === 0) {
    return null;
  }

  const first = available[0];
  const last = available[available.length - 1];
  const resolved = resolveWeekSelection(selection, available);

  const setRange = (from: number, to: number) => {
    onChange({
      mode: "range",
      from: Math.min(from, to),
      to: Math.max(from, to),
      weeks: [],
    });
  };

  const setList = (weeks: number[]) => {
    onChange({ mode: "list", from: selection.from, to: selection.to, weeks });
  };

  const applyDraft = () => {
    const parsed = parseWeekExpression(draft, available);
    if (!parsed) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    setList(parsed);
  };

  const takeLast = (count: number) => available.slice(Math.max(0, available.length - count));

  return (
    <div className="flex flex-col gap-2 font-mono text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={selection.mode === "range" ? "default" : "outline"}
            className="h-7 px-2 font-mono text-xs"
            disabled={disabled}
            onClick={() => setRange(selection.from || first, selection.to || last)}
          >
            Rango
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selection.mode === "list" ? "default" : "outline"}
            className="h-7 px-2 font-mono text-xs"
            disabled={disabled}
            onClick={() => setList(resolved)}
          >
            Selección
          </Button>
        </div>

        {selection.mode === "range" ? (
          <div className="flex items-center gap-1">
            <Select
              disabled={disabled}
              value={String(selection.from)}
              onValueChange={(value) => setRange(Number(value), selection.to)}
            >
              <SelectTrigger
                size="sm"
                aria-label="Semana inicial"
                className="h-7 w-20 font-mono text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {available.map((week) => (
                  <SelectItem key={week} value={String(week)} className="font-mono text-xs">
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
              onValueChange={(value) => setRange(selection.from, Number(value))}
            >
              <SelectTrigger
                size="sm"
                aria-label="Semana final"
                className="h-7 w-20 font-mono text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {available.map((week) => (
                  <SelectItem key={week} value={String(week)} className="font-mono text-xs">
                    {`S${week}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Input
              aria-label="Semanas"
              aria-invalid={invalid}
              disabled={disabled}
              className="h-7 w-56 font-mono text-xs"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setInvalid(false);
              }}
              onBlur={applyDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyDraft();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 font-mono text-xs"
              disabled={disabled}
              onClick={applyDraft}
            >
              Aplicar
            </Button>
          </div>
        )}

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
            variant="outline"
            className="h-7 px-2 font-mono text-xs"
            disabled={disabled || available.length <= 8}
            onClick={() => setList(takeLast(8))}
          >
            Últimas 8
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 font-mono text-xs"
            disabled={disabled || available.length <= 12}
            onClick={() => setList(takeLast(12))}
          >
            Últimas 12
          </Button>
        </div>
      </div>

      {invalid ? (
        <p role="alert" className="text-xs text-destructive">
          Expresión de semanas no válida
        </p>
      ) : (
        <ul className="flex flex-wrap items-center gap-1">
          {resolved.map((week) => (
            <li
              key={week}
              className={cn(
                "rounded-sm border border-border px-1.5 py-0.5 text-[0.65rem] tabular-nums",
                "text-muted-foreground"
              )}
            >
              {`S${week}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
