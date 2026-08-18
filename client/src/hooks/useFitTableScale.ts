import { useLayoutEffect, useRef, useState } from "react";

interface UseFitTableScaleOptions {
  /** Recomputed whenever any of these change, e.g. row or column count. */
  deps?: unknown[];
  /** Floor so a very dense table stays legible instead of vanishing. */
  minScale?: number;
}

/**
 * Shrinks a table's font size and row padding just enough that its natural
 * height fits the space its scroll container actually has. Any department's
 * upload can add rows the layout never anticipated (more buildings, more
 * resolution categories, ...); this keeps that table on one slide instead of
 * scrolling or spilling past the frame, without a row-count guess baked in.
 *
 * Consumers read the `--fit-scale` custom property set on the table element,
 * e.g. `text-[length:calc(var(--fit-scale,1)*1.1cqi)]`.
 */
export function useFitTableScale<
  TContainer extends HTMLElement = HTMLDivElement,
  TTable extends HTMLElement = HTMLTableElement,
>({ deps = [], minScale = 0.55 }: UseFitTableScaleOptions = {}) {
  const containerRef = useRef<TContainer>(null);
  const tableRef = useRef<TTable>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const table = tableRef.current;

    if (!container || !table) {
      return;
    }

    const fit = () => {
      // Measure the table's natural size first: shrinking is only ever
      // computed from full size, so repeated passes cannot ratchet down.
      table.style.setProperty("--fit-scale", "1");
      const available = container.clientHeight;
      const natural = table.scrollHeight;

      if (available <= 0 || natural <= 0) {
        return;
      }

      // Small safety margin so rounding never leaves a 1px overflow.
      const next = Math.max(minScale, Math.min(1, (available / natural) * 0.98));
      table.style.setProperty("--fit-scale", String(next));
      setScale(next);
    };

    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(container);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { containerRef, tableRef, scale };
}
