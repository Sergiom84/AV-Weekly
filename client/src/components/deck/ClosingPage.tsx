import type { DeckPage } from "@shared/informe";
import EditableText from "./EditableText";
import SlideFrame from "./SlideFrame";

interface ClosingPageProps {
  page: DeckPage;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
  /** Correlative number of the page inside the visible deck. */
  number?: number | null;
  muted?: boolean;
  /** Artwork behind the slide. Defaults to the AV corporate back cover. */
  background?: string;
}

/**
 * Closing slide: the corporate back cover with the editable message on top.
 * The text sits above the logo, clear of the "Tech for the future" claim.
 */
export default function ClosingPage({
  page,
  editing,
  onChange,
  number,
  muted,
  background = "/informe/contraportada.png",
}: ClosingPageProps) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  const fieldRing = editing ? "ring-white/40 focus:ring-white" : "";

  return (
    <SlideFrame number={number} muted={muted} background={background}>
      <div className="@container flex h-full w-full">
        <div className="flex w-[62%] flex-col justify-start pt-[8%]">
          <h1 className="text-[4.6cqi] leading-tight text-white">
            <EditableText
              value={page.text.title ?? ""}
              onChange={setSlot("title")}
              editing={editing}
              ariaLabel="Título de la contraportada"
              className={`block w-full ${fieldRing}`}
            />
          </h1>

          <p className="mt-[1.6cqi] font-mono text-[1.6cqi] leading-snug text-white/75">
            <EditableText
              value={page.text.subtitle ?? ""}
              onChange={setSlot("subtitle")}
              editing={editing}
              multiline
              ariaLabel="Texto de la contraportada"
              className={`block w-full ${fieldRing}`}
            />
          </p>
        </div>
      </div>
    </SlideFrame>
  );
}
