import type { DeckPage } from "@shared/deck/core";
import EditableText from "./EditableText";
import SlideFrame from "./SlideFrame";

interface SectionPageProps<TPage extends DeckPage<string, string>> {
  page: TPage;
  editing: boolean;
  onChange: (patch: Partial<TPage>) => void;
  /** Correlative number of the page inside the visible deck. */
  number?: number | null;
  muted?: boolean;
  /** Artwork behind the slide. Defaults to the AV corporate divider. */
  background?: string;
}

/**
 * Section divider over the corporate artwork. The title sits in the upper area
 * so it clears the logo band and the claim printed on the image.
 */
export default function SectionPage<TPage extends DeckPage<string, string>>({
  page,
  editing,
  onChange,
  number,
  muted,
  background = "/informe/contraportada.png",
}: SectionPageProps<TPage>) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } } as Partial<TPage>);

  const subtitle = page.text.subtitle ?? "";
  const fieldRing = editing ? "ring-white/40 focus:ring-white" : "";

  return (
    <SlideFrame number={number} muted={muted} background={background}>
      <div className="@container flex h-full w-full">
        <div className="flex w-[62%] flex-col justify-start pt-[6%]">
          <h2 className="text-[4.4cqi] leading-tight text-white">
            <EditableText
              value={page.text.title ?? ""}
              onChange={setSlot("title")}
              editing={editing}
              ariaLabel="Título de la sección"
              className={`block w-full ${fieldRing}`}
            />
          </h2>

          {(editing || subtitle) && (
            <p className="mt-[1.4cqi] font-mono text-[1.6cqi] uppercase tracking-wide text-white/75">
              <EditableText
                value={subtitle}
                onChange={setSlot("subtitle")}
                editing={editing}
                ariaLabel="Subtítulo de la sección"
                className={`block w-full ${fieldRing}`}
              />
            </p>
          )}
        </div>
      </div>
    </SlideFrame>
  );
}
