import { useEffect, useState, type ReactNode } from "react";

/** The export browser mounts just one slide, keeping Chromium's memory bounded. */
export default function PdfDeckView<Page extends { id: string }>({
  pages,
  loading,
  error,
  renderPage,
}: {
  pages: { page: Page; visible: boolean; number: number | null }[];
  loading: boolean;
  error: string | null;
  renderPage: (
    page: Page,
    number: number | null,
    muted: boolean,
    editing: boolean
  ) => ReactNode;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const visible = pages.filter(entry => entry.visible);
  useEffect(() => {
    const select = (event: Event) =>
      setIndex((event as CustomEvent<number | null>).detail);
    window.addEventListener("avw:pdf-slide", select);
    return () => window.removeEventListener("avw:pdf-slide", select);
  }, []);
  const entry = index === null ? undefined : visible[index];
  return (
    <main
      data-deck-root
      data-pdf-ready={!loading}
      data-pdf-error={error ?? undefined}
      data-pdf-count={visible.length}
      data-pdf-slide={entry ? index : undefined}
      style={{ width: 1600 }}
    >
      <div data-deck-list>
        {entry && (
          <section
            key={entry.page.id}
            id={`slide-${entry.page.id}`}
            data-deck-slide
            data-deck-visible="true"
          >
            {renderPage(entry.page, entry.number, false, false)}
          </section>
        )}
      </div>
    </main>
  );
}

export function isPdfRender(): boolean {
  return new URLSearchParams(window.location.search).get("pdf") === "slides";
}
