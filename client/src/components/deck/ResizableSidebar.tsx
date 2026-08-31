import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

const MIN_WIDTH = 280;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 320;

function clamp(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

interface ResizableSidebarProps {
  /** Same localStorage namespace the section collapse state already uses. */
  storagePrefix: string;
  children: ReactNode;
}

/**
 * Sidebar column with a drag handle on its right edge. Width persists per
 * module so each department can size it independently of the others.
 */
export default function ResizableSidebar({
  storagePrefix,
  children,
}: ResizableSidebarProps) {
  const storageKey = `${storagePrefix}sidebar-width`;
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_WIDTH;
    }

    const stored = Number(window.localStorage.getItem(storageKey));

    return Number.isFinite(stored) ? clamp(stored) : DEFAULT_WIDTH;
  });
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(width));
  }, [width, storageKey]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!draggingRef.current) {
      return;
    }

    setWidth(clamp(startWidthRef.current + (event.clientX - startXRef.current)));
  }, []);

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopDragging);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [handlePointerMove]);

  const startDragging = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      draggingRef.current = true;
      startXRef.current = event.clientX;
      startWidthRef.current = width;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [handlePointerMove, stopDragging, width]
  );

  // Drop a live drag if the component unmounts mid-gesture (route change).
  useEffect(() => stopDragging, [stopDragging]);

  return (
    <div
      className="relative w-full flex-shrink-0 print:hidden lg:w-[var(--sidebar-width)]"
      style={{ ["--sidebar-width" as string]: `${width}px` }}
    >
      {/* Own scroll track: the sidebar reaches its last page without moving the deck. */}
      <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 print:max-h-none print:overflow-visible">
        {children}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar ancho de la barra lateral"
        title="Arrastra para ajustar el ancho · doble clic para restablecer"
        onPointerDown={startDragging}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        className="absolute -right-3 top-0 z-10 hidden h-full w-6 cursor-col-resize items-center justify-center lg:flex print:hidden"
      >
        <div className="h-16 w-1 rounded-full bg-border transition-colors hover:bg-primary" />
      </div>
    </div>
  );
}
