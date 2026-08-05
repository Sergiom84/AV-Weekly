import type { DeckPage } from "@shared/informe";
import EditableText from "./EditableText";
import SlideFrame from "./SlideFrame";

interface IndexPageProps {
  page: DeckPage;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
  /** Correlative number of the page inside the visible deck. */
  number?: number | null;
  muted?: boolean;
}

const ITEM_KEYS = ["item1", "item2", "item3", "item4", "item5", "item6"] as const;

export default function IndexPage({
  page,
  editing,
  onChange,
  number,
  muted,
}: IndexPageProps) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  return (
    <SlideFrame number={number} muted={muted}>
      <div className="@container flex h-full w-full flex-col gap-[3cqi]">
        <h2 className="text-[4cqi] leading-tight text-foreground">
          <EditableText
            value={page.text.title ?? ""}
            onChange={setSlot("title")}
            editing={editing}
            ariaLabel="Título del índice"
            className="block w-full"
          />
        </h2>

        <ol className="ml-[4cqi] flex flex-col gap-[1.4cqi] border-l border-border pl-[3cqi]">
          {ITEM_KEYS.map((key, position) => (
            <li key={key} className="font-mono text-[1.8cqi] text-foreground">
              <EditableText
                value={page.text[key] ?? ""}
                onChange={setSlot(key)}
                editing={editing}
                ariaLabel={`Entrada ${position + 1} del índice`}
                className="block w-full"
              />
            </li>
          ))}
        </ol>
      </div>
    </SlideFrame>
  );
}
