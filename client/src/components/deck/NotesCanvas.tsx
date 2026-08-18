import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { GripHorizontal, ImagePlus, X } from "lucide-react";
import type { LayoutBox } from "@shared/deck/core";

interface NotesCanvasProps {
  body: string;
  textBox: LayoutBox | undefined;
  images: string[];
  imageLayout: Record<string, LayoutBox>;
  editing: boolean;
  uploading: boolean;
  uploadError: string | null;
  onBodyChange: (value: string) => void;
  onTextBoxChange: (box: LayoutBox) => void;
  onImageBoxChange: (url: string, box: LayoutBox) => void;
  onAddClick: () => void;
  onRemoveImage: (url: string) => void;
}

const TEXT_DEFAULT: LayoutBox = { x: 2, y: 3, width: 50, height: 55 };
const IMAGE_DEFAULT = { width: 26, height: 38 };
const MIN_SIZE = 8;

/** Identifies which block a drag is acting on: the single text block or one image. */
type BlockId = { type: "text" } | { type: "image"; url: string };

interface DragState {
  block: BlockId;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  startBox: LayoutBox;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sameBlock(a: BlockId, b: BlockId) {
  return a.type === b.type && (a.type !== "image" || a.url === (b as { url: string }).url);
}

/** Staggers each new image's default spot so a few in a row don't fully overlap. */
function defaultImageBox(index: number): LayoutBox {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: clamp(56 + col * 20, 0, 100 - IMAGE_DEFAULT.width),
    y: clamp(4 + row * 24, 0, 100 - IMAGE_DEFAULT.height),
    ...IMAGE_DEFAULT,
  };
}

/**
 * Freeform canvas covering the body of a notes slide: the text block and every
 * uploaded image are boxes the user drags to place and resizes from the corner,
 * stored in percent of the canvas so they scale with the slide wherever it is
 * rendered. The parent's `onChange` (and the debounced save behind it) fires
 * once on release, not on every pointer move.
 */
export default function NotesCanvas({
  body,
  textBox,
  images,
  imageLayout,
  editing,
  uploading,
  uploadError,
  onBodyChange,
  onTextBoxChange,
  onImageBoxChange,
  onAddClick,
  onRemoveImage,
}: NotesCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const liveBoxRef = useRef<LayoutBox | null>(null);
  const [, setLiveTick] = useState(0);

  const boxFor = (block: BlockId, stored: LayoutBox): LayoutBox => {
    const drag = dragRef.current;

    if (drag && liveBoxRef.current && sameBlock(drag.block, block)) {
      return liveBoxRef.current;
    }

    return stored;
  };

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;

    if (!drag || !canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const deltaXPct = ((event.clientX - drag.startX) / rect.width) * 100;
    const deltaYPct = ((event.clientY - drag.startY) / rect.height) * 100;

    const next: LayoutBox =
      drag.mode === "move"
        ? {
            ...drag.startBox,
            x: clamp(drag.startBox.x + deltaXPct, 0, 100 - drag.startBox.width),
            y: clamp(drag.startBox.y + deltaYPct, 0, 100 - drag.startBox.height),
          }
        : {
            ...drag.startBox,
            width: clamp(drag.startBox.width + deltaXPct, MIN_SIZE, 100 - drag.startBox.x),
            height: clamp(drag.startBox.height + deltaYPct, MIN_SIZE, 100 - drag.startBox.y),
          };

    liveBoxRef.current = next;
    setLiveTick((tick) => tick + 1);
  }, []);

  const stopDrag = useCallback(() => {
    const drag = dragRef.current;
    const box = liveBoxRef.current;

    if (drag && box) {
      if (drag.block.type === "text") {
        onTextBoxChange(box);
      } else {
        onImageBoxChange(drag.block.url, box);
      }
    }

    dragRef.current = null;
    liveBoxRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopDrag);
  }, [handlePointerMove, onImageBoxChange, onTextBoxChange]);

  const startDrag =
    (block: BlockId, mode: "move" | "resize", box: LayoutBox) =>
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!editing) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragRef.current = { block, mode, startX: event.clientX, startY: event.clientY, startBox: box };
      liveBoxRef.current = box;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDrag);
    };

  const text = boxFor({ type: "text" }, textBox ?? TEXT_DEFAULT);
  const showText = editing || body.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={canvasRef}
        className={`relative min-h-0 w-full flex-1 overflow-hidden rounded-[0.4cqi] ${
          editing ? "border border-dashed border-border/60 bg-muted/10" : ""
        }`}
      >
        {showText && (
          <div
            className="absolute flex flex-col"
            style={{
              left: `${text.x}%`,
              top: `${text.y}%`,
              width: `${text.width}%`,
              height: `${text.height}%`,
            }}
          >
            {editing ? (
              <div className="group flex h-full flex-col rounded-[0.3cqi] ring-1 ring-inset ring-border focus-within:ring-2 focus-within:ring-ring">
                <div
                  onPointerDown={startDrag({ type: "text" }, "move", text)}
                  title="Mover el texto"
                  className="flex shrink-0 cursor-move items-center justify-center rounded-t-[0.3cqi] bg-muted/40 py-[0.2cqi] text-muted-foreground"
                >
                  <GripHorizontal className="h-[1.2cqi] w-[1.2cqi]" />
                </div>

                <textarea
                  aria-label="Contenido de la hoja"
                  value={body}
                  placeholder="Escribe aquí lo ocurrido durante la semana…"
                  onChange={(event) => onBodyChange(event.target.value)}
                  className="min-h-0 w-full flex-1 resize-none bg-transparent p-[0.4cqi] font-mono text-[1.6cqi] leading-snug outline-none"
                />

                <div
                  onPointerDown={startDrag({ type: "text" }, "resize", text)}
                  aria-hidden="true"
                  title="Redimensionar el texto"
                  className="absolute bottom-0 right-0 h-[1.6cqi] w-[1.6cqi] cursor-nwse-resize rounded-tl-[0.3cqi] bg-foreground/30 opacity-0 transition-opacity group-hover:opacity-100"
                />
              </div>
            ) : (
              <div className="h-full w-full overflow-hidden whitespace-pre-wrap font-mono text-[1.6cqi] leading-snug">
                {body}
              </div>
            )}
          </div>
        )}

        {images.map((url, index) => {
          const box = boxFor({ type: "image", url }, imageLayout[url] ?? defaultImageBox(index));

          return (
            <div
              key={url}
              onPointerDown={startDrag({ type: "image", url }, "move", box)}
              className="group absolute overflow-hidden rounded-[0.3cqi] border border-border bg-background shadow-sm"
              style={{
                left: `${box.x}%`,
                top: `${box.y}%`,
                width: `${box.width}%`,
                height: `${box.height}%`,
                cursor: editing ? "move" : "default",
              }}
            >
              <img
                src={url}
                alt=""
                draggable={false}
                className="h-full w-full select-none object-cover"
              />

              {editing && (
                <>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onRemoveImage(url)}
                    aria-label="Quitar imagen"
                    title="Quitar imagen"
                    className="absolute right-[0.3cqi] top-[0.3cqi] rounded-full bg-background/90 p-[0.3cqi] text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-[1.2cqi] w-[1.2cqi]" />
                  </button>

                  <div
                    onPointerDown={startDrag({ type: "image", url }, "resize", box)}
                    aria-hidden="true"
                    title="Redimensionar"
                    className="absolute bottom-0 right-0 h-[1.6cqi] w-[1.6cqi] cursor-nwse-resize rounded-tl-[0.3cqi] bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </>
              )}
            </div>
          );
        })}

        {editing && (
          <button
            type="button"
            onClick={onAddClick}
            disabled={uploading}
            className="absolute bottom-[0.5cqi] right-[0.5cqi] flex items-center gap-[0.4cqi] rounded-md border border-border bg-background/90 px-[0.6cqi] py-[0.3cqi] font-mono text-[1cqi] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <ImagePlus className="h-[1.3cqi] w-[1.3cqi]" />
            {uploading ? "Subiendo…" : "Añadir imagen"}
          </button>
        )}
      </div>

      {uploadError && (
        <p className="mt-[0.6cqi] shrink-0 font-mono text-[1cqi] text-destructive" role="alert">
          {uploadError}
        </p>
      )}
    </div>
  );
}
