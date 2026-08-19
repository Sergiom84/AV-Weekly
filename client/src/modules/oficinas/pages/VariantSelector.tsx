import type { OficinasValidadoras } from "@shared/modules/oficinas/types";
import { VALIDADORAS_VARIANTS } from "../aggregate";

interface VariantSelectorProps {
  value: OficinasValidadoras;
  onChange: (value: OficinasValidadoras) => void;
}

/**
 * Which of the three DT matrices the incident pages draw.
 *
 * The template ships the same directorate table counting the validator
 * incidents, excluding them and only them, and the published report reads the
 * first two on different slides. The choice is persisted on `page.supportType`,
 * which the deck chassis already stores, so it survives a reload and reaches
 * the exported pptx.
 *
 * Rendered only while the deck is in edit mode, like the correction grid: it is
 * the editor, not part of the slide. The chosen variant is named in the page
 * footnote instead, which is where the reader needs it.
 */
export default function VariantSelector({
  value,
  onChange,
}: VariantSelectorProps) {
  return (
    <div className="flex shrink-0 items-center gap-[0.6cqi] print:hidden">
      {VALIDADORAS_VARIANTS.map(entry => (
        <button
          key={entry.value}
          type="button"
          aria-pressed={entry.value === value}
          onClick={() => onChange(entry.value)}
          className={
            entry.value === value
              ? "rounded-md border border-foreground px-[0.9cqi] py-[0.35cqi] font-mono text-[1.1cqi] text-foreground"
              : "rounded-md border border-border px-[0.9cqi] py-[0.35cqi] font-mono text-[1.1cqi] text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}
