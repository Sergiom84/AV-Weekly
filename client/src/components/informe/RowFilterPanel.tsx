import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface RowFilterPanelProps {
  /** Every row label available in the source matrix. */
  labels: string[];
  hiddenRows: string[];
  /** Namespaces the checkbox ids so several pages can coexist. */
  scope: string;
  /** Rows hidden by the page's default preset. */
  defaultHidden: string[];
  onChange: (hiddenRows: string[]) => void;
}

/**
 * Row visibility filter for a weekly page. The selection is stored on the deck
 * page, so it survives a reload.
 */
export default function RowFilterPanel({
  labels,
  hiddenRows,
  scope,
  defaultHidden,
  onChange,
}: RowFilterPanelProps) {
  if (labels.length === 0) {
    return null;
  }

  const allVisible = hiddenRows.length === 0;
  const allHidden = hiddenRows.length >= labels.length;
  const sameAsDefault =
    hiddenRows.length === defaultHidden.length &&
    defaultHidden.every((label) => hiddenRows.includes(label));

  const toggle = (label: string, visible: boolean) =>
    onChange(
      visible ? hiddenRows.filter((item) => item !== label) : [...hiddenRows, label]
    );

  return (
    <div className="mt-[1cqi] shrink-0 space-y-[0.6cqi]">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={allVisible}
          onClick={() => onChange([])}
        >
          Seleccionar todo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={allHidden}
          onClick={() => onChange([...labels])}
        >
          Deseleccionar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={sameAsDefault}
          onClick={() => onChange([...defaultHidden])}
        >
          Defecto
        </Button>
      </div>

      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
        {labels.map((label) => {
          const id = `row-${scope}-${label}`;
          const visible = !hiddenRows.includes(label);

          return (
            <li key={label} className="flex items-center gap-1.5">
              <Checkbox
                id={id}
                checked={visible}
                onCheckedChange={(checked) => toggle(label, checked === true)}
              />
              <label htmlFor={id} className="cursor-pointer">
                {label}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
