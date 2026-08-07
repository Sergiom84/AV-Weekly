import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Loader2 } from "lucide-react";
import { isPageVisible } from "@shared/deck/core";
import { getDeckModule } from "@shared/deck/registry";
import {
  INFORMATICA_PAGE_SECTIONS,
  hasSectionData,
} from "@shared/modules/informatica/deck";
import type { InformaticaDeckPage } from "@shared/modules/informatica/types";
import MainNav from "@/components/MainNav";
import HomeLink from "@/components/HomeLink";
import ClosingPage from "@/components/deck/ClosingPage";
import ComingSoonPage from "@/components/deck/ComingSoonPage";
import CoverPage from "@/components/deck/CoverPage";
import DeckSidebar, { type SidebarUpload } from "@/components/deck/DeckSidebar";
import IndexPage from "@/components/deck/IndexPage";
import SectionPage from "@/components/deck/SectionPage";
import SlideFrame from "@/components/deck/SlideFrame";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInformaticaDeck } from "@/modules/informatica/useInformaticaDeck";
import CitasAnualPage from "@/modules/informatica/pages/CitasAnualPage";
import CitasMensualPage from "@/modules/informatica/pages/CitasMensualPage";
import CitasSemanalPage from "@/modules/informatica/pages/CitasSemanalPage";
import PeticionesAnualPage from "@/modules/informatica/pages/PeticionesAnualPage";
import PeticionesPage from "@/modules/informatica/pages/PeticionesPage";
import WorkOrdersAnualPage from "@/modules/informatica/pages/WorkOrdersAnualPage";
import WorkOrdersPage from "@/modules/informatica/pages/WorkOrdersPage";
import type { InformaticaPageProps } from "@/modules/informatica/pages/PageShell";
import type { InformaticaDataset } from "@shared/modules/informatica/types";

const MODULE = getDeckModule("informatica");

/**
 * Data pages implemented so far, by page id. A page missing from this map — or
 * one whose sections are not in the workbook — renders the "Próximamente"
 * notice, which is the expected state while the source sheets arrive.
 */
const DATA_PAGES: Record<
  string,
  (props: InformaticaPageProps & { dataset: InformaticaDataset }) => ReactElement
> = {
  workorders: WorkOrdersPage,
  "workorders-anual": WorkOrdersAnualPage,
  peticiones: PeticionesPage,
  "peticiones-anual": PeticionesAnualPage,
  "citas-semanal": CitasSemanalPage,
  "citas-mensual": CitasMensualPage,
  "citas-anual": CitasAnualPage,
};

function scrollToPage(pageId: string) {
  const node = document.getElementById(`slide-${pageId}`);

  if (!node) {
    return;
  }

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  node.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

export default function Informatica() {
  const { deck, dataset, loading, saving, error, uploadTo, updatePage, resetDeck } =
    useInformaticaDeck();
  const [editing, setEditing] = useState(false);

  const handlePageChange = useCallback(
    (pageId: string) => (patch: Partial<InformaticaDeckPage>) =>
      updatePage(pageId, patch),
    [updatePage]
  );

  const uploads = useMemo<SidebarUpload[]>(
    () =>
      (MODULE.deck?.uploads ?? []).map((slot) => ({
        id: `informatica-upload-${slot.id}`,
        label: slot.label,
        sourceFile: dataset.source?.sourceFile ?? null,
        uploadedAt: dataset.source?.uploadedAt ?? null,
        onUpload: (file: File) => uploadTo(slot.id, file),
      })),
    [dataset.source, uploadTo]
  );

  const artwork = MODULE.deck?.artwork;
  const pages = deck?.pages ?? [];
  const hasSource = Boolean(dataset.source?.sourceFile);

  let visibleNumber = 0;
  const rendered = pages
    .map((page) => {
      const visible = isPageVisible(page);

      if (visible) {
        visibleNumber += 1;
      }

      if (!visible && !editing) {
        return null;
      }

      return { page, visible, number: visible ? visibleNumber : null };
    })
    .filter(
      (
        entry
      ): entry is { page: InformaticaDeckPage; visible: boolean; number: number | null } =>
        entry !== null
    );

  const renderPage = (
    page: InformaticaDeckPage,
    number: number | null,
    muted: boolean
  ) => {
    const onChange = handlePageChange(page.id);

    switch (page.kind) {
      case "cover":
        return (
          <CoverPage
            page={page}
            editing={editing}
            onChange={onChange}
            number={number}
            muted={muted}
            background={artwork?.cover}
          />
        );
      case "index":
        return (
          <IndexPage
            page={page}
            editing={editing}
            onChange={onChange}
            number={number}
            muted={muted}
            background={artwork?.divider}
          />
        );
      case "section":
        return (
          <SectionPage
            page={page}
            editing={editing}
            onChange={onChange}
            number={number}
            muted={muted}
            background={artwork?.divider}
          />
        );
      case "closing":
        return (
          <ClosingPage
            page={page}
            editing={editing}
            onChange={onChange}
            number={number}
            muted={muted}
            background={artwork?.divider}
          />
        );
      default: {
        const DataPage = DATA_PAGES[page.id];
        const ready =
          Boolean(DataPage) &&
          hasSectionData(dataset, INFORMATICA_PAGE_SECTIONS[page.id] ?? []);

        if (!DataPage || !ready) {
          return (
            <ComingSoonPage
              page={page}
              editing={editing}
              onChange={onChange}
              number={number}
              muted={muted}
            />
          );
        }

        return (
          <SlideFrame number={number} muted={muted}>
            <DataPage
              page={page}
              editing={editing}
              onChange={onChange}
              dataset={dataset}
            />
          </SlideFrame>
        );
      }
    }
  };

  if (loading && !deck) {
    return (
      <div className="min-h-screen bg-background">
        <MainNav rightSlot={<HomeLink />} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
            <p className="font-mono text-sm text-muted-foreground">Cargando informe</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MainNav rightSlot={<HomeLink />} />

      <main className="container py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="w-full flex-shrink-0 lg:w-80">
            {/* Own scroll track: the sidebar reaches its last page without moving the deck. */}
            <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 print:max-h-none print:overflow-visible">
              <DeckSidebar
                deck={deck}
                uploads={uploads}
                kindLabels={MODULE.deck?.kindLabels ?? {}}
                storagePrefix={MODULE.deck?.storagePrefix ?? ""}
                editing={editing}
                onEditingChange={setEditing}
                loading={loading}
                saving={saving}
                error={error}
                onUpdatePage={updatePage}
                onResetDeck={resetDeck}
                onSelectPage={scrollToPage}
              />
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-12">
            {error && (
              <Card className="border-destructive/40">
                <CardHeader>
                  <CardTitle className="text-base text-destructive">Error</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-sm text-destructive">{error}</p>
                </CardContent>
              </Card>
            )}

            {!hasSource && !loading && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sin datos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-sm text-muted-foreground">
                    Falta el libro plano de Informática.
                  </p>
                </CardContent>
              </Card>
            )}

            {rendered.map(({ page, visible, number }) => (
              <section key={page.id} id={`slide-${page.id}`} className="scroll-mt-24">
                {!visible && (
                  <p className="mb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                    Oculta
                  </p>
                )}
                {renderPage(page, number, !visible)}
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
