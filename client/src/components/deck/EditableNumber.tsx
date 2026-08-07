import { cn } from "@/lib/utils";

interface EditableNumberProps {
  /** Effective value: the override when present, otherwise the imported one. */
  value: number | null;
  onChange: (value: number | null) => void;
  editing: boolean;
  /** True when the value comes from a manual override, not from the import. */
  overridden?: boolean;
  className?: string;
  ariaLabel: string;
}

/**
 * A single numeric cell of a deck table. Empty input clears the cell to null,
 * which is what blanks a week or a month in the report.
 */
export default function EditableNumber({
  value,
  onChange,
  editing,
  overridden,
  className,
  ariaLabel,
}: EditableNumberProps) {
  if (!editing) {
    return (
      <span className={cn("font-mono tabular-nums", overridden && "text-primary", className)}>
        {value == null ? "" : value}
      </span>
    );
  }

  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      className={cn(
        "w-full rounded-sm bg-transparent text-center font-mono tabular-nums outline-none",
        "ring-1 ring-inset ring-border focus:ring-2 focus:ring-ring",
        overridden && "text-primary ring-primary/40",
        className
      )}
      value={value == null ? "" : String(value)}
      onChange={(event) => {
        const raw = event.target.value.trim();
        if (raw === "") {
          onChange(null);
          return;
        }

        const parsed = Number(raw.replace(",", "."));
        if (Number.isFinite(parsed)) {
          onChange(Math.trunc(parsed));
        }
      }}
    />
  );
}
