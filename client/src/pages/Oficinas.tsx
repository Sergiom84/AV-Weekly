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
  OFICINAS_PAGE_SECTIONS,
  OFICINAS_SERVICE,
  createDefaultOficinasDeck,
  hasSectionData,
} from "@shared/modules/oficinas/deck";
import { reportPeriod, reportWeek } from "@shared/modules/oficinas/derived";
import type { OficinasDeckPage } from "@shared/modules/oficinas/types";
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
import { useOficinasDeck } from "@/modules/oficinas/useOficinasDeck";
import AsignadasDTPage from "@/modules/oficinas/pages/AsignadasDTPage";
import AsignadasElementoPage from "@/modules/oficinas/pages/AsignadasElementoPage";
import AsignadasSemanalPage from "@/modules/oficinas/pages/AsignadasSemanalPage";
import EncuestasPage from "@/modules/oficinas/pages/EncuestasPage";
import PeticionesDTPage from "@/modules/oficinas/pages/PeticionesDTPage";
import PeticionesDTSemanalPage from "@/modules/oficinas/pages/PeticionesDTSemanalPage";
import PeticionesTipoPage from "@/modules/oficinas/pages/PeticionesTipoPage";
import PeticionesTipoSemanalPage from "@/modules/oficinas/pages/PeticionesTipoSemanalPage";
import RecicladoresDTPage from "@/modules/oficinas/pages/RecicladoresDTPage";
import RecicladoresDTSemanalPage from "@/modules/oficinas/pages/RecicladoresDTSemanalPage";
import RecicladoresElementoPage from "@/modules/oficinas/pages/RecicladoresElementoPage";
import RecicladoresElementoSemanalPage from "@/modules/oficinas/pages/RecicladoresElementoSemanalPage";
import ResueltasDTPage from "@/modules/oficinas/pages/ResueltasDTPage";
import ResueltasElementoPage from "@/modules/oficinas/pages/ResueltasElementoPage";
import ResueltasSemanalPage from "@/modules/oficinas/pages/ResueltasSemanalPage";
import type { OficinasDataPageProps } from "@/modules/oficinas/pages/PageShell";

/** Index entries the printed report lists, one more than the slide draws by default. */
const INDEX_ITEMS = ["item1", "item2", "item3", "item4", "item5", "item6", "item7"];

const MODULE = getDeckModule("oficinas");

/**
 * Data pages implemented so far, by page id. A page missing from this map — or
 * one whose sections are not in the dataset — renders the "Próximamente"
 * notice, which is the expected state before the first weekly upload.
 */
const DATA_PAGES: Record<
  string,
  (props: OficinasDataPageProps) => ReactElement
> = {
  "oficinas-asignadas-dt": AsignadasDTPage,
  "oficinas-asignadas-semanal": AsignadasSemanalPage,
  "oficinas-asignadas-elemento": AsignadasElementoPage,
  "oficinas-resueltas-dt": ResueltasDTPage,
  "oficinas-resueltas-semanal": ResueltasSemanalPage,
  "oficinas-resueltas-elemento": ResueltasElementoPage,
  "oficinas-peticiones-dt-semanal": PeticionesDTSemanalPage,
  "oficinas-peticiones-dt": PeticionesDTPage,
  "oficinas-peticiones-tipo-semanal": PeticionesTipoSemanalPage,
  "oficinas-peticiones-tipo": PeticionesTipoPage,
  "oficinas-encuestas": EncuestasPage,
  "oficinas-recicladores-dt-semanal": RecicladoresDTSemanalPage,
  "oficinas-recicladores-dt": RecicladoresDTPage,
  "oficinas-recicladores-elemento-semanal": RecicladoresElementoSemanalPage,
  "oficinas-recicladores-elemento": RecicladoresElementoPage,
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

export default function Oficinas() {
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
  } = useOficinasDeck();
  const [editing, setEditing] = useState(false);
  const [presenting, setPresenting] = useState(false);

  // Pages that ship with the deck are never deletable: only the ones a user
  // added by hand carry a remove control.
  const seededIds = useMemo(
    () => new Set(createDefaultOficinasDeck().pages.map(page => page.id)),
    []
  );

  const handlePageChange = useCallback(
    (pageId: string) => (patch: Partial<OficinasDeckPage>) =>
      updatePage(pageId, patch),
    [updatePage]
  );

  const uploads = useMemo<SidebarUpload[]>(
    () =>
      (MODULE.deck?.uploads ?? []).map(slot => ({
        id: `oficinas-upload-${slot.id}`,
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
  const reportYear = dataset.year ?? new Date().getFullYear();
  const closedWeek = reportWeek(dataset, reportYear);

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
        page: OficinasDeckPage;
        visible: boolean;
        number: number | null;
      } => entry !== null
    );

  const renderPage = (
    page: OficinasDeckPage,
    number: number | null,
    muted: boolean,
    editingOverride?: boolean
  ) => {
    const isEditing = editingOverride ?? editing;
    const onChange = handlePageChange(page.id);

    switch (page.kind) {
      case "cover":
        const coverPage =
          page.text.period?.trim() || closedWeek === null
            ? page
            : {
                ...page,
                text: {
                  ...page.text,
                  period: reportPeriod(reportYear, closedWeek),
                },
              };

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
      case "index":
        return (
          <IndexPage
            page={page}
            editing={isEditing}
            onChange={onChange}
            number={number}
            muted={muted}
            background={artwork?.divider}
            itemKeys={INDEX_ITEMS}
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
              onRemove={
                seededIds.has(page.id) ? undefined : () => removePage(page.id)
              }
            />
          </SlideFrame>
        );
      default: {
        const DataPage = DATA_PAGES[page.id];
        const ready =
          Boolean(DataPage) &&
          hasSectionData(dataset, OFICINAS_PAGE_SECTIONS[page.id] ?? []);

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
                pdfHref="/api/oficinas/pdf"
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
                    Falta el template semanal de Oficinas.
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
                    addPage(createSectionPage(nanoid(), "section", "3. Anexo"))
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
                      createNotesPage(nanoid(), "notes", OFICINAS_SERVICE)
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
