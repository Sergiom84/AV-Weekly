import type { DeckPage } from "@shared/informe";
import EditableText from "./EditableText";
import SlideFrame from "./SlideFrame";

interface CoverPageProps {
  page: DeckPage;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
  /** Correlative number of the page inside the visible deck. */
  number?: number | null;
  muted?: boolean;
}

export default function CoverPage({
  page,
  editing,
  onChange,
  number,
  muted,
}: CoverPageProps) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  return (
    <SlideFrame number={number} muted={muted}>
      <div className="@container flex h-full w-full flex-col justify-center gap-[3cqi]">
        <h1 className="text-[5.4cqi] leading-tight text-foreground">
          <EditableText
            value={page.text.title ?? ""}
            onChange={setSlot("title")}
            editing={editing}
            ariaLabel="Título de la portada"
            className="block w-full"
          />
        </h1>

        <div className="flex flex-col gap-[1.2cqi] border-t border-border pt-[2cqi]">
          <p className="font-mono text-[2.2cqi] uppercase tracking-wide text-muted-foreground">
            <EditableText
              value={page.text.subtitle ?? ""}
              onChange={setSlot("subtitle")}
              editing={editing}
              ariaLabel="Subtítulo de la portada"
              className="block w-full"
            />
          </p>
          <p className="font-mono text-[1.5cqi] text-muted-foreground">
            <EditableText
              value={page.text.period ?? ""}
              onChange={setSlot("period")}
              editing={editing}
              ariaLabel="Periodo del informe"
              className="block w-full"
            />
          </p>
        </div>
      </div>
    </SlideFrame>
  );
}
