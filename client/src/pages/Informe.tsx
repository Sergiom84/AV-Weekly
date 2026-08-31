import { useCallback, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  AV_SERVICE,
  createDefaultDeck,
  generateWeeklySpeech,
  isPageVisible,
} from "@shared/informe";
import type { DeckPage } from "@shared/informe";
import { createNotesPage, createSectionPage, weekCoverLabel } from "@shared/deck/core";
import { getDeckModule } from "@shared/deck/registry";
import { useAvDeck } from "@/modules/av/useAvDeck";
import MainNav from "@/components/MainNav";
import HomeLink from "@/components/HomeLink";
import DeckSidebar, {
  type SidebarExportAction,
  type SidebarUpload,
} from "@/components/deck/DeckSidebar";
import CoverPage from "@/components/deck/CoverPage";
import IndexPage from "@/components/deck/IndexPage";
import PageOrderControls from "@/components/deck/PageOrderControls";
import SectionPage from "@/components/deck/SectionPage";
import ClosingPage from "@/components/deck/ClosingPage";
import NotesPage from "@/components/deck/NotesPage";
import PresentationOverlay from "@/components/deck/PresentationOverlay";
import MonthlyTrendPage from "@/modules/av/pages/MonthlyTrendPage";
import ResolutionDetailPage from "@/modules/av/pages/ResolutionDetailPage";
import WeeklySupportPage from "@/modules/av/pages/WeeklySupportPage";
import SlideFrame from "@/components/deck/SlideFrame";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Eye, EyeOff, FileText, Loader2, Plus } from "lucide-react";

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

const MODULE = getDeckModule("av");

export default function Informe() {
  const {
    deck,
    weekly,
    monthly,
    loading,
    saving,
    error,
    uploadTo,
    updatePage,
    addPage,
    movePage,
    removePage,
    resetDeck,
  } = useAvDeck();
  const [editing, setEditing] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [speechOpen, setSpeechOpen] = useState(false);
  const [speechCopied, setSpeechCopied] = useState(false);
  const speechRef = useRef<HTMLTextAreaElement>(null);

  const speech = useMemo(
    () => generateWeeklySpeech(weekly, deck),
    [deck, weekly]
  );

  const copySpeech = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(speech);
    } catch {
      speechRef.current?.select();
      document.execCommand("copy");
    }
    setSpeechCopied(true);
  }, [speech]);

  const exportActions = useMemo<SidebarExportAction[]>(
    () => [
      {
        id: "weekly-speech",
        label: "Speech semanal",
        icon: <FileText className="h-4 w-4" />,
        onClick: () => {
          setSpeechCopied(false);
          setSpeechOpen(true);
        },
      },
    ],
    []
  );

  // Pages that ship with the deck are never deletable: only the ones a user
  // added by hand carry a remove control.
  const seededIds = useMemo(
    () => new Set(createDefaultDeck().pages.map(page => page.id)),
    []
  );

  const uploads = useMemo<SidebarUpload[]>(() => {
    const sources: Record<
      string,
      { sourceFile: string | null; uploadedAt: string | null }
    > = {
      semanal: { sourceFile: weekly.sourceFile, uploadedAt: weekly.uploadedAt },
      tendencia: {
        sourceFile: monthly.sourceFile,
        uploadedAt: monthly.uploadedAt,
      },
      plano: weekly.resolutionSource ?? { sourceFile: null, uploadedAt: null },
    };

    return (MODULE.deck?.uploads ?? []).map(slot => ({
      id: `informe-upload-${slot.id}`,
      label: slot.label,
      sourceFile: sources[slot.id]?.sourceFile ?? null,
      uploadedAt: sources[slot.id]?.uploadedAt ?? null,
      // AV keeps one workbook per zone: the sidebar never sends more than one.
      onUpload: (files: File[]) => uploadTo(slot.id, files[0]),
    }));
  }, [
    monthly.sourceFile,
    monthly.uploadedAt,
    uploadTo,
    weekly.resolutionSource,
    weekly.sourceFile,
    weekly.uploadedAt,
  ]);

  const handlePageChange = useCallback(
    (pageId: string) => (patch: Partial<DeckPage>) => updatePage(pageId, patch),
    [updatePage]
  );

  const pages = deck?.pages ?? [];
  const hasSource = Boolean(weekly.sourceFile);

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
      ): entry is { page: DeckPage; visible: boolean; number: number | null } =>
        entry !== null
    );

  const renderPage = (
    page: DeckPage,
    number: number | null,
    muted: boolean,
    editingOverride?: boolean
  ) => {
    const isEditing = editingOverride ?? editing;
    const onChange = handlePageChange(page.id);

    switch (page.kind) {
      case "cover": {
        const week = weekly.maxWeek;
        const year =
          monthly.years.length > 0
            ? monthly.years[monthly.years.length - 1]
            : weekly.uploadedAt
              ? Number(weekly.uploadedAt.slice(0, 4))
              : new Date().getUTCFullYear();
        const derivedPeriod =
          week > 0 && Number.isFinite(year) ? weekCoverLabel(week, year) : "";
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
            background={MODULE.deck?.artwork?.cover}
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
            onRemove={
              seededIds.has(page.id) ? undefined : () => removePage(page.id)
            }
          />
        );
      case "monthlyTrend":
        return (
          <SlideFrame number={number} muted={muted}>
            <MonthlyTrendPage
              page={page}
              monthly={monthly}
              editing={isEditing}
              onChange={onChange}
            />
          </SlideFrame>
        );
      case "closing":
        return (
          <ClosingPage
            page={page}
            editing={isEditing}
            onChange={onChange}
            number={number}
            muted={muted}
          />
        );
      case "resolutionDetail":
        return (
          <SlideFrame number={number} muted={muted}>
            <ResolutionDetailPage
              page={page}
              weekly={weekly}
              editing={isEditing}
              onChange={onChange}
            />
          </SlideFrame>
        );
      case "weeklySupport":
        return (
          <SlideFrame number={number} muted={muted}>
            <WeeklySupportPage
              page={page}
              weekly={weekly}
              editing={isEditing}
              onChange={onChange}
            />
          </SlideFrame>
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
      default:
        return (
          <SlideFrame number={number} muted={muted}>
            <div className="flex h-full w-full items-center justify-center">
              <p className="font-mono text-sm text-muted-foreground">
                Página no implementada
              </p>
            </div>
          </SlideFrame>
        );
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
                pdfHref="/api/informe/pdf"
                onPresent={() => setPresenting(true)}
                exportActions={exportActions}
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
                    Falta la plantilla semanal.
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
                    addPage(createNotesPage(nanoid(), "notes", AV_SERVICE))
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

      <Dialog
        open={speechOpen}
        onOpenChange={open => {
          setSpeechOpen(open);
          if (!open) setSpeechCopied(false);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Speech semanal</DialogTitle>
            <DialogDescription className="sr-only">
              Speech semanal de Audiovisuales
            </DialogDescription>
          </DialogHeader>
          <textarea
            ref={speechRef}
            readOnly
            value={speech}
            aria-label="Speech semanal"
            className="min-h-[55vh] w-full resize-y rounded-md border border-border bg-background p-4 font-mono text-sm leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <DialogFooter className="items-center">
            <span
              className="mr-auto font-mono text-xs text-muted-foreground"
              aria-live="polite"
            >
              {speechCopied ? "Copiado" : ""}
            </span>
            <Button
              type="button"
              onClick={() => void copySpeech()}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
