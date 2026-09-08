import type { ReactNode } from "react";
import EditableText from "@/components/deck/EditableText";
import SlideHeading from "@/components/deck/SlideHeading";
import { SlideEditorPanel } from "@/components/deck/SlideEditorFrame";
import type { InformaticaDeckPage } from "@shared/modules/informatica/types";

export interface InformaticaPageProps {
  page: InformaticaDeckPage;
  editing: boolean;
  onChange: (patch: Partial<InformaticaDeckPage>) => void;
}

interface PageShellProps extends InformaticaPageProps {
  children: ReactNode;
  hideFootnote?: boolean;
  /** Selectors and correction grids, drawn under the slide instead of inside it. */
  editor?: ReactNode;
}

/** Heading, body and footnote every Informatica data page shares. */
export default function PageShell({
  page,
  editing,
  onChange,
  children,
  hideFootnote = false,
  editor,
}: PageShellProps) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  return (
    <div className="@container flex h-full w-full flex-col text-foreground">
      {editing && <SlideEditorPanel>{editor}</SlideEditorPanel>}
      <SlideHeading
        service={page.text.subtitle ?? ""}
        title={page.text.title ?? ""}
        editing={editing}
        onServiceChange={setSlot("subtitle")}
        onTitleChange={setSlot("title")}
      />

      <div className="mt-[1.5cqi] flex min-h-0 flex-1 flex-col gap-[1.2cqi]">
        {children}
      </div>

      {!hideFootnote && (editing || page.text.footnote) && (
        <p className="mt-[1cqi] shrink-0 font-mono text-[1.15cqi] leading-snug text-muted-foreground">
          <EditableText
            value={page.text.footnote ?? ""}
            onChange={setSlot("footnote")}
            editing={editing}
            multiline
            ariaLabel="Nota al pie"
            className="block w-full"
          />
        </p>
      )}
    </div>
  );
}
