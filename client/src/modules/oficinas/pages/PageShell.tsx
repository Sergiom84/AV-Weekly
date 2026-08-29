import type { ReactNode } from "react";
import EditableText from "@/components/deck/EditableText";
import SlideHeading from "@/components/deck/SlideHeading";
import type {
  OficinasDataset,
  OficinasDeckPage,
} from "@shared/modules/oficinas/types";

export interface OficinasPageProps {
  page: OficinasDeckPage;
  editing: boolean;
  onChange: (patch: Partial<OficinasDeckPage>) => void;
}

/** Props of every implemented data page, as `Oficinas.tsx` calls them. */
export interface OficinasDataPageProps extends OficinasPageProps {
  dataset: OficinasDataset;
}

interface PageShellProps extends OficinasPageProps {
  children: ReactNode;
  dense?: boolean;
}

/** Heading, body and footnote every Oficinas data page shares. */
export default function PageShell({
  page,
  editing,
  onChange,
  children,
  dense = false,
}: PageShellProps) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  return (
    <div className="@container flex h-full w-full flex-col text-foreground">
      <SlideHeading
        service={page.text.subtitle ?? ""}
        title={page.text.title ?? ""}
        editing={editing}
        onServiceChange={setSlot("subtitle")}
        onTitleChange={setSlot("title")}
      />

      <div className={`flex min-h-0 flex-1 flex-col ${dense ? "mt-[0.8cqi] gap-[0.5cqi]" : "mt-[1.5cqi] gap-[1.2cqi]"}`}>
        {children}
      </div>

      {(editing || page.text.footnote) && (
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
