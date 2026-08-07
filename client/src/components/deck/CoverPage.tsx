import type { DeckPage } from "@shared/deck/core";
import EditableText from "./EditableText";
import SlideFrame from "./SlideFrame";

interface CoverPageProps<TPage extends DeckPage<string, string>> {
  page: TPage;
  editing: boolean;
  onChange: (patch: Partial<TPage>) => void;
  /** Correlative number of the page inside the visible deck. */
  number?: number | null;
  muted?: boolean;
  /** Artwork behind the slide. Defaults to the AV corporate cover. */
  background?: string;
}

/**
 * Cover slide: the corporate artwork fills the frame and the editable text sits
 * on the dark panel to its left. Colours are fixed rather than themed, because
 * the background image is the same in light and dark mode.
 */
export default function CoverPage<TPage extends DeckPage<string, string>>({
  page,
  editing,
  onChange,
  number,
  muted,
  background = "/informe/portada.png",
}: CoverPageProps<TPage>) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } } as Partial<TPage>);

  const fieldRing = editing ? "ring-white/40 focus:ring-white" : "";

  return (
    <SlideFrame number={number} muted={muted} background={background}>
      <div className="@container flex h-full w-full">
        <div className="flex w-[44%] flex-col justify-end pb-[10%]">
          <h1 className="text-[4.6cqi] leading-tight text-white">
            <EditableText
              value={page.text.title ?? ""}
              onChange={setSlot("title")}
              editing={editing}
              ariaLabel="Título de la portada"
              className={`block w-full ${fieldRing}`}
            />
          </h1>

          <p className="mt-[2cqi] font-mono text-[1.9cqi] uppercase tracking-wide text-white/80">
            <EditableText
              value={page.text.subtitle ?? ""}
              onChange={setSlot("subtitle")}
              editing={editing}
              ariaLabel="Subtítulo de la portada"
              className={`block w-full ${fieldRing}`}
            />
          </p>

          <p className="mt-[0.8cqi] font-mono text-[1.4cqi] text-white/70">
            <EditableText
              value={page.text.period ?? ""}
              onChange={setSlot("period")}
              editing={editing}
              ariaLabel="Periodo del informe"
              className={`block w-full ${fieldRing}`}
            />
          </p>
        </div>
      </div>
    </SlideFrame>
  );
}
