export interface KpiItem {
  label: string;
  value: string;
}

interface KpiRowProps {
  items: KpiItem[];
}

/** Row of headline figures, as the boxed KPIs of the printed report. */
export default function KpiRow({ items }: KpiRowProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="flex shrink-0 gap-[1.2cqi]">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex-1 rounded-md border border-border px-[1.4cqi] py-[1cqi]"
        >
          <p className="font-mono text-[1.1cqi] uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-[0.4cqi] font-mono text-[2.4cqi] tabular-nums text-foreground">
            {item.value}
          </p>
        </li>
      ))}
    </ul>
  );
}
