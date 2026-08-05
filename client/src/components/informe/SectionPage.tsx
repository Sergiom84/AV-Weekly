import type { DeckPage } from "@shared/informe";
import EditableText from "./EditableText";
import SlideFrame from "./SlideFrame";

interface SectionPageProps {
  page: DeckPage;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
  /** Correlative number of the page inside the visible deck. */
  number?: number | null;
  muted?: boolean;
}

export default function SectionPage({
  page,
  editing,
  onChange,
  number,
  muted,
}: SectionPageProps) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  const subtitle = page.text.subtitle ?? "";

  return (
    <SlideFrame number={number} muted={muted}>
      <div className="@container flex h-full w-full flex-col items-center justify-center gap-[2cqi] text-center">
        <h2 className="text-[5cqi] leading-tight text-foreground">
          <EditableText
            value={page.text.title ?? ""}
            onChange={setSlot("title")}
            editing={editing}
            ariaLabel="Título de la sección"
            className="block w-full text-center"
          />
        </h2>

        {(editing || subtitle) && (
          <p className="font-mono text-[1.8cqi] uppercase tracking-wide text-muted-foreground">
            <EditableText
              value={subtitle}
              onChange={setSlot("subtitle")}
              editing={editing}
              ariaLabel="Subtítulo de la sección"
              className="block w-full text-center"
            />
          </p>
        )}
      </div>
    </SlideFrame>
  );
}
