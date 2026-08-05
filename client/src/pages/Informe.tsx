import { useCallback, useState } from "react";
import { isPageVisible } from "@shared/informe";
import type { DeckPage } from "@shared/informe";
import { useInformeData } from "@/hooks/useInformeData";
import MainNav from "@/components/MainNav";
import DeckSidebar from "@/components/informe/DeckSidebar";
import CoverPage from "@/components/informe/CoverPage";
import IndexPage from "@/components/informe/IndexPage";
import SectionPage from "@/components/informe/SectionPage";
import MonthlyTrendPage from "@/components/informe/MonthlyTrendPage";
import ResolutionDetailPage from "@/components/informe/ResolutionDetailPage";
import WeeklySupportPage from "@/components/informe/WeeklySupportPage";
import SlideFrame from "@/components/informe/SlideFrame";
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

export default function Informe() {
  const {
    deck,
    weekly,
    monthly,
    loading,
    saving,
    error,
    uploadWeekly,
    uploadTendencia,
    updatePage,
    resetDeck,
  } = useInformeData();
  const [editing, setEditing] = useState(false);

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
        <MainNav />
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
      <MainNav />

      <main className="container py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="w-full flex-shrink-0 lg:w-80">
            <div className="lg:sticky lg:top-20">
              <DeckSidebar
                deck={deck}
                weekly={weekly}

                editing={editing}
                onEditingChange={setEditing}
                loading={loading}
                saving={saving}
                error={error}
                monthly={monthly}
                onUploadWeekly={uploadWeekly}
                onUploadTendencia={uploadTendencia}
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
