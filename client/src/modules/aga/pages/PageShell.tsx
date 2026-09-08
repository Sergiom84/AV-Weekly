import type { ReactNode } from "react";
import EditableText from "@/components/deck/EditableText";
import SlideHeading from "@/components/deck/SlideHeading";
import { KpiLabelProvider } from "@/components/deck/KpiRow";
import type { AgaDeckPage } from "@shared/modules/aga/types";
import { SlideEditorPanel } from "@/components/deck/SlideEditorFrame";

export interface AgaPageProps {
  page: AgaDeckPage;
  editing: boolean;
  onChange: (patch: Partial<AgaDeckPage>) => void;
}

interface PageShellProps extends AgaPageProps {
  children: ReactNode;
  editor?: ReactNode;
}

/** Heading, body and footnote every AGA data page shares. */
export default function PageShell({
  page,
  editing,
  onChange,
  children,
  editor,
}: PageShellProps) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  return (
    <KpiLabelProvider
      editing={editing}
      labels={page.text}
      onRename={(key, label) => setSlot(key)(label)}
    >
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
    </KpiLabelProvider>
  );
}
