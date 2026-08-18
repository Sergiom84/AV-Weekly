import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { PresentationAnimationProvider } from "@/contexts/PresentationAnimationContext";

export interface PresentationSlide {
  id: string;
  node: ReactNode;
}

interface PresentationOverlayProps {
  slides: PresentationSlide[];
  onClose: () => void;
}

/**
 * Fullscreen, one-slide-at-a-time viewer shared by every module: arrow keys
 * or the on-screen chevrons advance, Escape (or exiting fullscreen) closes.
 * Only the active slide is mounted, so its charts remount — and replay their
 * entrance animation — every time it becomes current.
 */
export default function PresentationOverlay({
  slides,
  onClose,
}: PresentationOverlayProps) {
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (delta: number) => {
      setIndex(current =>
        Math.min(Math.max(current + delta, 0), slides.length - 1)
      );
    },
    [slides.length]
  );

  useEffect(() => {
    const node = containerRef.current;

    if (node?.requestFullscreen) {
      node.requestFullscreen().catch(() => {
        // Fullscreen can be denied (embedded iframe, user gesture policy);
        // the overlay still works windowed.
      });
    }

    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      } else if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [go, onClose]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onClose();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [onClose]);

  const active = slides[index];

  if (!active) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar presentación"
        title="Cerrar (Esc)"
        className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-2 text-white/70 opacity-40 transition hover:bg-black/60 hover:text-white hover:opacity-100"
      >
        <X className="h-5 w-5" />
      </button>

      {/*
        Letterboxed to the viewport on whichever axis is tighter, always at
        16:9, edge to edge: the chevrons and the counter float over the slide
        instead of taking layout space away from it.
      */}
      <div
        className="overflow-hidden"
        style={{
          height: "min(100dvh, calc(100vw * 9 / 16))",
          aspectRatio: "16 / 9",
        }}
      >
        <PresentationAnimationProvider value={true}>
          <div key={active.id} className="h-full w-full">
            {active.node}
          </div>
        </PresentationAnimationProvider>
      </div>

      <button
        type="button"
        onClick={() => go(-1)}
        disabled={index === 0}
        aria-label="Página anterior"
        className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/70 opacity-40 transition hover:bg-black/60 hover:text-white hover:opacity-100 disabled:opacity-10"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      <button
        type="button"
        onClick={() => go(1)}
        disabled={index === slides.length - 1}
        aria-label="Página siguiente"
        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/70 opacity-40 transition hover:bg-black/60 hover:text-white hover:opacity-100 disabled:opacity-10"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      <p className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 font-mono text-xs text-white/60">
        {index + 1} / {slides.length}
      </p>
    </div>
  );
}
