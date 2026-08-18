import { ChevronDown, ChevronUp } from "lucide-react";

interface PageOrderControlsProps {
  onMove: (delta: -1 | 1) => void;
  /** True for the first page of the deck. */
  atStart: boolean;
  /** True for the last page of the deck. */
  atEnd: boolean;
}

const BUTTON =
  "inline-flex items-center rounded-md border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground";

/** Moves a slide one position up or down in the deck. Only shown while editing. */
export default function PageOrderControls({
  onMove,
  atStart,
  atEnd,
}: PageOrderControlsProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={atStart}
        aria-label="Subir página"
        title="Subir página"
        className={BUTTON}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={atEnd}
        aria-label="Bajar página"
        title="Bajar página"
        className={BUTTON}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
