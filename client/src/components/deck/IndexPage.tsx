import type { DeckPage } from "@shared/deck/core";
import EditableText from "./EditableText";
import SlideFrame from "./SlideFrame";

interface IndexPageProps<TPage extends DeckPage<string, string>> {
  page: TPage;
  editing: boolean;
  onChange: (patch: Partial<TPage>) => void;
  /** Correlative number of the page inside the visible deck. */
  number?: number | null;
  muted?: boolean;
  /** Artwork behind the slide. Defaults to the AV corporate divider. */
  background?: string;
  /** Text slots rendered as index entries. Defaults to six. */
  itemKeys?: string[];
}

const DEFAULT_ITEM_KEYS = ["item1", "item2", "item3", "item4", "item5", "item6"];

/**
 * Index slide over the corporate artwork. The block sits in the upper area so
 * it clears the logo band and the claim printed on the image.
 */
export default function IndexPage<TPage extends DeckPage<string, string>>({
  page,
  editing,
  onChange,
  number,
  muted,
  background = "/informe/contraportada.png",
  itemKeys = DEFAULT_ITEM_KEYS,
}: IndexPageProps<TPage>) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } } as Partial<TPage>);

  const fieldRing = editing ? "ring-white/40 focus:ring-white" : "";

  return (
    <SlideFrame number={number} muted={muted} background={background}>
      <div className="@container flex h-full w-full">
        {/* Offset to the right: the list is tall enough to reach the logo band
            printed on the artwork, which sits in the left margin. */}
        <div className="ml-[22%] flex w-[46%] flex-col justify-start pt-[2%]">
          <h2 className="text-[3.4cqi] leading-tight text-white">
            <EditableText
              value={page.text.title ?? ""}
              onChange={setSlot("title")}
              editing={editing}
              ariaLabel="Título del índice"
              className={`block w-full ${fieldRing}`}
            />
          </h2>

          <ol className="mt-[1.6cqi] flex flex-col gap-[0.9cqi] border-l border-white/30 pl-[2.4cqi]">
            {itemKeys.map((key, position) => (
              <li key={key} className="font-mono text-[1.5cqi] text-white/85">
                <EditableText
                  value={page.text[key] ?? ""}
                  onChange={setSlot(key)}
                  editing={editing}
                  ariaLabel={`Entrada ${position + 1} del índice`}
                  className={`block w-full ${fieldRing}`}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </SlideFrame>
  );
}
