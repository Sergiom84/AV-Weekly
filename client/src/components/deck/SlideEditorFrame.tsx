import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/**
 * The editor of a slide, kept out of the slide.
 *
 * A deck page is a fixed 16:9 canvas that has to print, so selectors and
 * correction grids drawn inside it steal the room the chart needs and shrink
 * with it until they are unreadable. The frame renders them underneath instead,
 * inside a collapsible the page opens only while editing, and the page keeps
 * declaring them where it computes them: `SlideEditorPanel` portals whatever a
 * page puts in it into this frame.
 *
 * Introduced in AGA and shared from here, so Oficinas and Informática get the
 * same editor without a third copy of it. Its stylesheet is loaded from
 * `index.css`, not imported here: the page tests bundle these components with
 * esbuild, which has no loader for CSS.
 */

const EditorDestination = createContext<HTMLDivElement | null>(null);

/** Owns a slide's editor outside its fixed, printable canvas. */
export function SlideEditorFrame({
  children,
  editing,
  title,
}: {
  children: ReactNode;
  editing: boolean;
  title: string;
}) {
  const [destination, setDestination] = useState<HTMLDivElement | null>(null);
  return (
    <EditorDestination.Provider value={destination}>
      {children}
      {editing && (
        <Collapsible className="slide-editor mt-3 min-w-0 rounded-lg border border-border bg-background p-3 print:hidden">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="group w-full justify-between font-mono text-xs"
              aria-label={`Filtros y datos: ${title}`}
            >
              Filtros y datos
              <ChevronDown
                aria-hidden="true"
                className="size-4 group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent forceMount className="data-[state=closed]:hidden">
            <div
              ref={setDestination}
              className="slide-editor-controls flex min-w-0 flex-col gap-4 pt-4"
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </EditorDestination.Provider>
  );
}

export function SlideEditorPanel({ children }: { children: ReactNode }) {
  const destination = useContext(EditorDestination);
  return destination ? createPortal(children, destination) : null;
}
