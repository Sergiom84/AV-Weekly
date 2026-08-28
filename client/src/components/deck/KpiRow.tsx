export interface KpiItem {
  label: string;
  value: string;
}

interface KpiRowProps {
  items: KpiItem[];
  compact?: boolean;
}

/** Row of headline figures, as the boxed KPIs of the printed report. */
export default function KpiRow({ items, compact = false }: KpiRowProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className={`flex shrink-0 ${compact ? "gap-[0.7cqi]" : "gap-[1.2cqi]"}`}>
      {items.map((item) => (
        <li
          key={item.label}
          className={`flex flex-1 flex-col justify-center rounded-md border border-border ${
            compact
              ? "px-[0.9cqi] py-[0.55cqi] text-center transition-[transform,box-shadow,border-color,background-color] duration-150 ease-out hover:-translate-y-[0.1cqi] hover:scale-[1.015] hover:border-primary/30 hover:bg-primary/[0.03] hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
              : "px-[1.4cqi] py-[1cqi]"
          }`}
        >
          <p className={`font-mono uppercase tracking-wide text-muted-foreground ${compact ? "text-[0.95cqi]" : "text-[1.1cqi]"}`}>
            {item.label}
          </p>
          <p className={`font-mono tabular-nums text-foreground ${compact ? "mt-[0.15cqi] text-[1.9cqi]" : "mt-[0.4cqi] text-[2.4cqi]"}`}>
            {item.value}
          </p>
        </li>
      ))}
    </ul>
  );
}
