import { useCallback, useMemo, useState } from "react";
import { isPageVisible } from "@shared/informe";
import type { DeckPage } from "@shared/informe";
import { getDeckModule } from "@shared/deck/registry";
import { useAvDeck } from "@/modules/av/useAvDeck";
import MainNav from "@/components/MainNav";
import HomeLink from "@/components/HomeLink";
import DeckSidebar, { type SidebarUpload } from "@/components/deck/DeckSidebar";
import CoverPage from "@/components/deck/CoverPage";
import IndexPage from "@/components/deck/IndexPage";
import SectionPage from "@/components/deck/SectionPage";
import MonthlyTrendPage from "@/components/informe/MonthlyTrendPage";
import ResolutionDetailPage from "@/components/informe/ResolutionDetailPage";
import ClosingPage from "@/components/deck/ClosingPage";
import WeeklySupportPage from "@/components/informe/WeeklySupportPage";
import SlideFrame from "@/components/deck/SlideFrame";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

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
    resetDeck,
  } = useAvDeck();
  const [editing, setEditing] = useState(false);

  const uploads = useMemo<SidebarUpload[]>(() => {
    const sources: Record<string, { sourceFile: string | null; uploadedAt: string | null }> = {
      semanal: { sourceFile: weekly.sourceFile, uploadedAt: weekly.uploadedAt },
      tendencia: { sourceFile: monthly.sourceFile, uploadedAt: monthly.uploadedAt },
      plano: weekly.resolutionSource ?? { sourceFile: null, uploadedAt: null },
    };

    return (MODULE.deck?.uploads ?? []).map((slot) => ({
      id: `informe-upload-${slot.id}`,
      label: slot.label,
      sourceFile: sources[slot.id]?.sourceFile ?? null,
      uploadedAt: sources[slot.id]?.uploadedAt ?? null,
      onUpload: (file: File) => uploadTo(slot.id, file),
    }));
  }, [monthly.sourceFile, monthly.uploadedAt, uploadTo, weekly.resolutionSource, weekly.sourceFile, weekly.uploadedAt]);

  const handlePageChange = useCallback(
    (pageId: string) => (patch: Partial<DeckPage>) => updatePage(pageId, patch),
    [updatePage]
  );

  const pages = deck?.pages ?? [];
  const hasSource = Boolean(weekly.sourceFile);

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
    .filter((entry): entry is { page: DeckPage; visible: boolean; number: number | null } =>
      entry !== null
    );

  const renderPage = (page: DeckPage, number: number | null, muted: boolean) => {
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
          />
        );
      case "monthlyTrend":
        return (
          <SlideFrame number={number} muted={muted}>
            <MonthlyTrendPage
              page={page}
              monthly={monthly}
              editing={editing}
              onChange={onChange}
            />
          </SlideFrame>
        );
      case "closing":
        return (
          <ClosingPage
            page={page}
            editing={editing}
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
              editing={editing}
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
              editing={editing}
              onChange={onChange}
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
                    Falta la plantilla semanal.
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
