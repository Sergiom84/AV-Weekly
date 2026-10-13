import { useEffect, useRef, useState } from "react";
import { Download, Eye, Save } from "lucide-react";
import type { DeckState, InformeWeeklyDataset } from "@shared/informe";
import type { AvArchivedReport } from "@shared/modules/av/reportArchive";
import type { DeckActionResult } from "@/hooks/useDeckData";
import { SidebarSection } from "@/components/deck/DeckSidebar";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { isPageVisible } from "@shared/deck/core";

export default function ReportArchive({
  deck,
  weekly,
  disabled,
  saveNow,
  storagePrefix,
}: {
  deck: DeckState | null;
  weekly: InformeWeeklyDataset;
  disabled: boolean;
  saveNow: () => Promise<DeckActionResult>;
  storagePrefix: string;
}) {
  const [reports, setReports] = useState<AvArchivedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const lock = useRef(false);
  const deadline = useRef(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/informe/reports", { signal: controller.signal })
      .then(async response => {
        if (!response.ok)
          throw new Error("No se pudieron cargar los informes guardados.");
        const body = await response.json();
        setReports(body.reports);
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(
      () =>
        setRemaining(
          Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))
        ),
      1000
    );
    return () => window.clearInterval(timer);
  }, [busy]);

  const save = async () => {
    if (lock.current || !deck) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const estimate = 5 + deck.pages.filter(isPageVisible).length * 5;
    deadline.current = Date.now() + estimate * 1000;
    setRemaining(estimate);
    const controller = new AbortController();
    request.current = controller;
    try {
      const saved = await saveNow();
      if (!saved.success)
        throw new Error(saved.error ?? "No se pudo guardar la presentación.");
      controller.signal.throwIfAborted();
      const response = await fetch("/api/informe/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck, uploadedAt: weekly.uploadedAt }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "No se pudo guardar el informe.");
      setReports(body.reports);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo guardar el informe."
        );
    } finally {
      lock.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <SidebarSection
      id="informes-guardados"
      storagePrefix={storagePrefix}
      title="Informes guardados"
    >
      <CardContent className="space-y-3 font-mono">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`w-full justify-start gap-2 ${busy ? "h-auto py-2" : ""}`}
          disabled={disabled || loading || busy || !deck || !weekly.sourceFile}
          aria-busy={busy}
          onClick={() => void save()}
        >
          <Save className="h-4 w-4" />
          {busy ? (
            <span className="flex flex-col items-start gap-1">
              <span>Guardando</span>
              {remaining > 0 && (
                <span
                  className="text-xs tabular-nums"
                  role="timer"
                  aria-label={`Tiempo restante estimado: ${remaining} segundos`}
                >
                  ~{String(Math.floor(remaining / 60)).padStart(2, "0")}:
                  {String(remaining % 60).padStart(2, "0")}
                </span>
              )}
            </span>
          ) : (
            "Guardar informe"
          )}
        </Button>
        {loading && <p className="text-xs text-muted-foreground">Cargando</p>}
        {!loading && reports.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin informes</p>
        )}
        {reports.map(report => {
          const label = `Semana ${report.week} · ${report.year}`;
          const href = `/api/informe/reports/${report.id}/pdf`;
          return (
            <div
              key={report.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-2"
            >
              <span className="text-xs">{label}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" asChild>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Ver ${label}`}
                  >
                    <Eye className="h-4 w-4" />
                  </a>
                </Button>
                <Button variant="ghost" size="icon-sm" asChild>
                  <a
                    href={`${href}?download=1`}
                    download={report.filename}
                    aria-label={`Descargar ${label}`}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          );
        })}
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </SidebarSection>
  );
}
