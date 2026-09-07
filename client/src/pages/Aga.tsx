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
  AGA_PAGE_SECTIONS,
  AGA_SERVICE,
  createDefaultAgaDeck,
  hasSectionData,
} from "@shared/modules/aga/deck";
import type { AgaDataset, AgaDeckPage } from "@shared/modules/aga/types";
import { agaPeriodLabel } from "@shared/modules/aga/calendar";
import MainNav from "@/components/MainNav";
import HomeLink from "@/components/HomeLink";
import ClosingPage from "@/components/deck/ClosingPage";
import ComingSoonPage from "@/components/deck/ComingSoonPage";
import CoverPage from "@/components/deck/CoverPage";
import DeckSidebar, { type SidebarUpload } from "@/components/deck/DeckSidebar";
import ResizableSidebar from "@/components/deck/ResizableSidebar";
import IndexPage from "@/components/deck/IndexPage";
import NotesPage from "@/components/deck/NotesPage";
import PageOrderControls from "@/components/deck/PageOrderControls";
import PresentationOverlay from "@/components/deck/PresentationOverlay";
import SectionPage from "@/components/deck/SectionPage";
import SlideFrame from "@/components/deck/SlideFrame";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAgaDeck } from "@/modules/aga/useAgaDeck";
import AnualPeticionesPage from "@/modules/aga/pages/AnualPeticionesPage";
import AnualPosicionesPage from "@/modules/aga/pages/AnualPosicionesPage";
import ComparativaDepartamentoPage from "@/modules/aga/pages/ComparativaDepartamentoPage";
import ComparativaProyectoPage from "@/modules/aga/pages/ComparativaProyectoPage";
import EvolucionDepartamentoPage from "@/modules/aga/pages/EvolucionDepartamentoPage";
import GestionadasDepartamentoPage from "@/modules/aga/pages/GestionadasDepartamentoPage";
import GestionadasDepartamentoProductoPage from "@/modules/aga/pages/GestionadasDepartamentoProductoPage";
import GestionadasOfficePage from "@/modules/aga/pages/GestionadasOfficePage";
import GestionadasProductoPage from "@/modules/aga/pages/GestionadasProductoPage";
import GestionadasTotalPage from "@/modules/aga/pages/GestionadasTotalPage";
import GestionadasUbicacionPage from "@/modules/aga/pages/GestionadasUbicacionPage";
import TotalSemanalPage from "@/modules/aga/pages/TotalSemanalPage";
import type { AgaPageProps } from "@/modules/aga/pages/PageShell";
import { AgaEditorFrame } from "@/modules/aga/pages/AgaEditorPanel";

const MODULE = getDeckModule("aga");

/**
 * Data pages implemented so far, by page id. A page missing from this map — or
 * one whose sections are not in the dataset — renders the "Próximamente"
 * notice, which is the expected state before the first GPS upload.
 */
const DATA_PAGES: Record<
  string,
  (props: AgaPageProps & { dataset: AgaDataset }) => ReactElement
> = {
  "aga-total-semanal": TotalSemanalPage,
  "aga-evolucion-departamento": EvolucionDepartamentoPage,
  "aga-comparativa-departamento": ComparativaDepartamentoPage,
  "aga-comparativa-proyecto": ComparativaProyectoPage,
  "aga-gestionadas-total-semanal": GestionadasTotalPage,
  "aga-gestionadas-departamento": GestionadasDepartamentoPage,
  "aga-gestionadas-producto": GestionadasProductoPage,
  "aga-gestionadas-ubicacion": GestionadasUbicacionPage,
  "aga-gestionadas-gam": GestionadasDepartamentoProductoPage,
  "aga-gestionadas-portatiles": GestionadasDepartamentoProductoPage,
  "aga-gestionadas-almacen": GestionadasDepartamentoProductoPage,
  "aga-gestionadas-office": GestionadasOfficePage,
  "aga-anual-peticiones": AnualPeticionesPage,
  "aga-anual-posiciones": AnualPosicionesPage,
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

export default function Aga() {
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
  } = useAgaDeck();
  const [editing, setEditing] = useState(false);
  const [presenting, setPresenting] = useState(false);

  // Pages that ship with the deck are never deletable: only the ones a user
  // added by hand carry a remove control.
  const seededIds = useMemo(
    () => new Set(createDefaultAgaDeck().pages.map(page => page.id)),
    []
  );

  const handlePageChange = useCallback(
    (pageId: string) => (patch: Partial<AgaDeckPage>) =>
      updatePage(pageId, patch),
    [updatePage]
  );

  const uploads = useMemo<SidebarUpload[]>(
    () =>
      (MODULE.deck?.uploads ?? []).map(slot => {
        const source =
          slot.id === "gestionado"
            ? dataset.managed?.source
            : slot.id === "office"
              ? dataset.office?.source
              : slot.id === "texto"
                ? dataset.texto
                : dataset.source;

        return {
          id: `aga-upload-${slot.id}`,
          label: slot.label,
          sourceFile: source?.sourceFile ?? null,
          uploadedAt: source?.uploadedAt ?? null,
          multiple: slot.multiple ?? false,
          accept: slot.accept,
          onUpload: (files: File[]) => uploadTo(slot.id, files),
        };
      }),
    [
      dataset.managed?.source,
      dataset.office?.source,
      dataset.texto,
      dataset.source,
      uploadTo,
    ]
  );

  const artwork = MODULE.deck?.artwork;
  const pages = deck?.pages ?? [];
  const lastVisiblePageId = pages.filter(isPageVisible).at(-1)?.id;
  const hasSource = Boolean(dataset.source?.sourceFile);
  const latestWeek = dataset.weeks?.[dataset.weeks.length - 1];
  const derivedPeriod = latestWeek
    ? agaPeriodLabel(latestWeek.week, latestWeek.reportWeek)
    : "";

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
        page: AgaDeckPage;
        visible: boolean;
        number: number | null;
      } => entry !== null
    );

  const renderPage = (
    page: AgaDeckPage,
    number: number | null,
    muted: boolean,
    editingOverride?: boolean
  ) => {
    const isEditing = editingOverride ?? editing;
    const onChange = handlePageChange(page.id);

    switch (page.kind) {
      case "cover":
        const coverPage = derivedPeriod
          ? {
              ...page,
              text: { ...page.text, period: derivedPeriod },
            }
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
          hasSectionData(dataset, AGA_PAGE_SECTIONS[page.id] ?? []);

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
          <AgaEditorFrame
            editing={isEditing}
            title={page.text.title ?? page.id}
          >
            <SlideFrame number={number} muted={muted}>
              <DataPage
                page={page}
                editing={isEditing}
                onChange={onChange}
                dataset={dataset}
              />
            </SlideFrame>
          </AgaEditorFrame>
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

      <main className="deck-shell py-6" data-deck-root>
        <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
          <ResizableSidebar storagePrefix={MODULE.deck?.storagePrefix ?? ""}>
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
              onPresent={() => setPresenting(true)}
              pdfFilenamePrefix="AGA"
            />
          </ResizableSidebar>

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
                    Falta el excel GPS semanal.
                  </p>
                </CardContent>
              </Card>
            )}

            {rendered.map(({ page, visible, number }, index) => (
              <section
                key={page.id}
                id={`slide-${page.id}`}
                data-deck-slide
                data-deck-visible={visible}
                data-aga-last-visible={page.id === lastVisiblePageId || undefined}
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
                        "2. Peticiones gestionadas"
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
                    addPage(createNotesPage(nanoid(), "notes", AGA_SERVICE))
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
