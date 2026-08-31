import { useCallback, useMemo, useState, type ReactElement } from "react";
import { nanoid } from "nanoid";
import { Eye, EyeOff, Loader2, Plus } from "lucide-react";
import {
  createNotesPage,
  createSectionPage,
  isPageVisible,
} from "@shared/deck/core";
import { getDeckModule } from "@shared/deck/registry";
import {
  INFORMATICA_PAGE_SECTIONS,
  INFORMATICA_SERVICE,
  createDefaultInformaticaDeck,
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
import NotesPage from "@/components/deck/NotesPage";
import PageOrderControls from "@/components/deck/PageOrderControls";
import PresentationOverlay from "@/components/deck/PresentationOverlay";
import SectionPage from "@/components/deck/SectionPage";
import SlideFrame from "@/components/deck/SlideFrame";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInformaticaDeck } from "@/modules/informatica/useInformaticaDeck";
import { coverPeriodLabel } from "@/modules/informatica/aggregate";
import CitasAnualPage from "@/modules/informatica/pages/CitasAnualPage";
import CitasMensualPage from "@/modules/informatica/pages/CitasMensualPage";
import CitasSemanalPage from "@/modules/informatica/pages/CitasSemanalPage";
import EncuestasPage from "@/modules/informatica/pages/EncuestasPage";
import HicCategoriasPage from "@/modules/informatica/pages/HicCategoriasPage";
import HicWorkOrdersPage from "@/modules/informatica/pages/HicWorkOrdersPage";
import ImacsChartPage from "@/modules/informatica/pages/ImacsChartPage";
import ImacsTablePage from "@/modules/informatica/pages/ImacsTablePage";
import SlasPage from "@/modules/informatica/pages/SlasPage";
import Top5IncidenciasPage from "@/modules/informatica/pages/Top5IncidenciasPage";
import TopTenIncidenciasPage from "@/modules/informatica/pages/TopTenIncidenciasPage";
import PeticionesAnualPage from "@/modules/informatica/pages/PeticionesAnualPage";
import PeticionesPage from "@/modules/informatica/pages/PeticionesPage";
import RenoveAcumuladoPage from "@/modules/informatica/pages/RenoveAcumuladoPage";
import RenoveSemanalPage from "@/modules/informatica/pages/RenoveSemanalPage";
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
  (
    props: InformaticaPageProps & { dataset: InformaticaDataset }
  ) => ReactElement
> = {
  "volumetria-incidencias-wo": HicWorkOrdersPage,
  "volumetria-incidencias": HicCategoriasPage,
  "top5-incidencias": Top5IncidenciasPage,
  "top-ten-incidencias": TopTenIncidenciasPage,
  "encuestas-incidencias": EncuestasPage,
  workorders: WorkOrdersPage,
  slas: SlasPage,
  "workorders-anual": WorkOrdersAnualPage,
  peticiones: PeticionesPage,
  "peticiones-anual": PeticionesAnualPage,
  "citas-semanal": CitasSemanalPage,
  "citas-mensual": CitasMensualPage,
  "citas-anual": CitasAnualPage,
  "imacs-tablas": ImacsTablePage,
  "imacs-grafico": ImacsChartPage,
  renove: RenoveSemanalPage,
  "renove-acumulado": RenoveAcumuladoPage,
};

function scrollToPage(pageId: string) {
  const node = document.getElementById(`slide-${pageId}`);

  if (!node) {
    return;
  }

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  node.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: "start",
  });
}

export default function Informatica() {
  const {
    deck,
    dataset,
    loading,
    saving,
    error,
    uploadTo,
    updatePage,
    addPage,
    movePage,
    removePage,
    resetDeck,
  } = useInformaticaDeck();
  const [editing, setEditing] = useState(false);
  const [presenting, setPresenting] = useState(false);

  // Pages that ship with the deck are never deletable: only the ones a user
  // added by hand carry a remove control.
  const seededIds = useMemo(
    () => new Set(createDefaultInformaticaDeck().pages.map(page => page.id)),
    []
  );

  const handlePageChange = useCallback(
    (pageId: string) => (patch: Partial<InformaticaDeckPage>) =>
      updatePage(pageId, patch),
    [updatePage]
  );

  const uploads = useMemo<SidebarUpload[]>(
    () =>
      (MODULE.deck?.uploads ?? []).map(slot => ({
        id: `informatica-upload-${slot.id}`,
        label: slot.label,
        sourceFile: dataset.source?.sourceFile ?? null,
        uploadedAt: dataset.source?.uploadedAt ?? null,
        multiple: slot.multiple ?? false,
        accept: slot.accept,
        onUpload: (files: File[]) => uploadTo(slot.id, files),
      })),
    [dataset.source, uploadTo]
  );

  const artwork = MODULE.deck?.artwork;
  const pages = deck?.pages ?? [];
  const hasSource = Boolean(dataset.source?.sourceFile);
  const derivedPeriod = coverPeriodLabel(dataset);

  let visibleNumber = 0;
  const rendered = pages
    .map(page => {
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
      ): entry is {
        page: InformaticaDeckPage;
        visible: boolean;
        number: number | null;
      } => entry !== null
    );

  const renderPage = (
    page: InformaticaDeckPage,
    number: number | null,
    muted: boolean,
    editingOverride?: boolean
  ) => {
    const isEditing = editingOverride ?? editing;
    const onChange = handlePageChange(page.id);

    switch (page.kind) {
      case "cover": {
        const coverPage = derivedPeriod
          ? { ...page, text: { ...page.text, period: derivedPeriod } }
          : page;
        return (
          <CoverPage
            page={coverPage}
            editing={isEditing}
            onChange={onChange}
            number={number}
            muted={muted}
            background={artwork?.cover}
          />
        );
      }
      case "index":
        return (
          <IndexPage
            page={page}
            editing={isEditing}
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
            editing={isEditing}
            onChange={onChange}
            number={number}
            muted={muted}
            background={artwork?.divider}
            onRemove={
              seededIds.has(page.id) ? undefined : () => removePage(page.id)
            }
          />
        );
      case "closing":
        return (
          <ClosingPage
            page={page}
            editing={isEditing}
            onChange={onChange}
            number={number}
            muted={muted}
            background={artwork?.divider}
          />
        );
      case "notes":
        return (
          <SlideFrame number={number} muted={muted}>
            <NotesPage
              page={page}
              editing={isEditing}
              onChange={onChange}
              onRemove={() => removePage(page.id)}
            />
          </SlideFrame>
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
              editing={isEditing}
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
              editing={isEditing}
              onChange={onChange}
              dataset={dataset}
            />
          </SlideFrame>
        );
      }
    }
  };

  const presentationSlides = pages
    .filter(page => isPageVisible(page))
    .map((page, index) => ({
      id: page.id,
      node: renderPage(page, index + 1, false, false),
    }));

  if (loading && !deck) {
    return (
      <div className="min-h-screen bg-background">
        <MainNav rightSlot={<HomeLink />} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
            <p className="font-mono text-sm text-muted-foreground">
              Cargando informe
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MainNav rightSlot={<HomeLink />} />

      <main className="container py-8" data-deck-root>
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="w-full flex-shrink-0 lg:w-80 print:hidden">
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
                pdfHref="/api/informatica/pdf"
                onPresent={() => setPresenting(true)}
              />
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-12" data-deck-list>
            {error && (
              <Card className="border-destructive/40">
                <CardHeader>
                  <CardTitle className="text-base text-destructive">
                    Error
                  </CardTitle>
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

            {rendered.map(({ page, visible, number }, index) => (
              <section
                key={page.id}
                id={`slide-${page.id}`}
                data-deck-slide
                className="scroll-mt-24"
              >
                <div className="mb-2 flex items-center justify-between gap-2 print:hidden">
                  {!visible ? (
                    <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      Oculta
                    </p>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2">
                    {editing && (
                      <PageOrderControls
                        onMove={delta => movePage(page.id, delta)}
                        atStart={index === 0}
                        atEnd={index === rendered.length - 1}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => updatePage(page.id, { visible: !visible })}
                      aria-label={visible ? "Ocultar página" : "Mostrar página"}
                      aria-pressed={visible}
                      title={
                        visible
                          ? "Se muestra en el informe"
                          : "No se muestra en el informe"
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {visible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                {renderPage(page, number, !visible)}
              </section>
            ))}

            {editing && (
              <div className="flex gap-3 print:hidden">
                <button
                  type="button"
                  onClick={() =>
                    addPage(
                      createSectionPage(
                        nanoid(),
                        "section",
                        "2. Asuntos pendientes"
                      )
                    )
                  }
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-10 font-mono text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  <Plus className="h-5 w-5" />
                  Añadir carátula
                </button>
                <button
                  type="button"
                  onClick={() =>
                    addPage(
                      createNotesPage(nanoid(), "notes", INFORMATICA_SERVICE)
                    )
                  }
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-10 font-mono text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  <Plus className="h-5 w-5" />
                  Añadir hoja
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {presenting && (
        <PresentationOverlay
          slides={presentationSlides}
          onClose={() => setPresenting(false)}
        />
      )}
    </div>
  );
}
