import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import "./aga-editor.css";

const EditorDestination = createContext<HTMLDivElement | null>(null);

/** Owns a slide's editor outside its fixed, printable canvas. */
export function AgaEditorFrame({
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
        <Collapsible className="aga-editor mt-3 min-w-0 rounded-lg border border-border bg-background p-3 print:hidden">
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
              className="aga-editor-controls flex min-w-0 flex-col gap-4 pt-4"
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </EditorDestination.Provider>
  );
}

export function AgaEditorPanel({ children }: { children: ReactNode }) {
  const destination = useContext(EditorDestination);
  return destination ? createPortal(children, destination) : null;
}
