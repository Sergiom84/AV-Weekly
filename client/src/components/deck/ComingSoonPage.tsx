import EditableText from "./EditableText";
import SlideFrame from "./SlideFrame";
import SlideHeading from "./SlideHeading";
import type { DeckPage } from "@shared/deck/core";

interface ComingSoonPageProps<TPage extends DeckPage<string, string>> {
  page: TPage;
  editing: boolean;
  onChange: (patch: Partial<TPage>) => void;
  number?: number | null;
  muted?: boolean;
}

/**
 * Slide of a page whose dataset has not been imported yet. It keeps the frame,
 * the heading and the footnote of a data page, so the deck reads as one
 * document while the source sheets arrive.
 */
export default function ComingSoonPage<TPage extends DeckPage<string, string>>({
  page,
  editing,
  onChange,
  number,
  muted,
}: ComingSoonPageProps<TPage>) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } } as Partial<TPage>);

  return (
    <SlideFrame number={number} muted={muted}>
      <div className="@container flex h-full w-full flex-col text-foreground">
        <SlideHeading
          service={page.text.subtitle ?? ""}
          title={page.text.title ?? ""}
          editing={editing}
          onServiceChange={setSlot("subtitle")}
          onTitleChange={setSlot("title")}
        />

        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="rounded-lg border border-dashed border-border px-[4cqi] py-[3cqi] text-center">
            <p className="font-mono text-[2cqi] uppercase tracking-wide text-foreground">
              Próximamente
            </p>
            <p className="mt-[1cqi] font-mono text-[1.3cqi] text-muted-foreground">
              Sin datos importados
            </p>
          </div>
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
    </SlideFrame>
  );
}
