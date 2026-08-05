import { useRef, useState } from "react";
import { isPageVisible } from "@shared/informe";
import type {
  DeckPage,
  DeckState,
  InformeMonthlyDataset,
  InformeWeeklyDataset,
} from "@shared/informe";
import type { InformeActionResult } from "@/hooks/useInformeData";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type VisibilityValue = "auto" | "on" | "off";

interface DeckSidebarProps {
  deck: DeckState | null;
  weekly: InformeWeeklyDataset;
  monthly: InformeMonthlyDataset;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onUploadWeekly: (file: File) => Promise<InformeActionResult>;
  onUploadMonthly: (file: File) => Promise<InformeActionResult>;
  onUpdatePage: (pageId: string, patch: Partial<DeckPage>) => void;
  onResetDeck: () => Promise<InformeActionResult>;
  onSelectPage: (pageId: string) => void;
}

const KIND_LABEL: Record<string, string> = {
  cover: "Portada",
  index: "Índice",
  section: "Sección",
  monthlyTrend: "Tendencia mensual",
  weeklySupport: "Soporte semanal",
  resolutionDetail: "Detalle de resolución",
  pendingItems: "Asuntos pendientes",
  closing: "Cierre",
};

function formatUploadedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function visibilityValue(page: DeckPage): VisibilityValue {
  if (page.visible === null) {
    return "auto";
  }

  return page.visible ? "on" : "off";
}

interface UploadZoneProps {
  id: string;
  label: string;
  sourceFile: string | null;
  uploadedAt: string | null;
  disabled: boolean;
  onUpload: (file: File) => Promise<InformeActionResult>;
}

function UploadZone({
  id,
  label,
  sourceFile,
  uploadedAt,
  disabled,
  onUpload,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const uploadedLabel = formatUploadedAt(uploadedAt);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setBusy(true);
    setLocalError(null);
    const result = await onUpload(file);
    setBusy(false);

    if (!result.success) {
      setLocalError(result.error ?? "Carga fallida");
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="font-mono text-sm font-semibold text-foreground">
          {label}
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Cargando" : "Seleccionar"}
        </Button>
      </div>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={handleChange}
      />

      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {sourceFile ?? "Sin fichero"}
        {uploadedLabel ? ` · ${uploadedLabel}` : ""}
      </p>

      {localError && (
        <p className="mt-2 font-mono text-xs text-destructive" role="alert">
          {localError}
        </p>
      )}
    </div>
  );
}

export default function DeckSidebar({
  deck,
  weekly,
  monthly,
  editing,
  onEditingChange,
  loading,
  saving,
  error,
  onUploadWeekly,
  onUploadMonthly,
  onUpdatePage,
  onResetDeck,
  onSelectPage,
}: DeckSidebarProps) {
  const today = new Date();
  const pages = deck?.pages ?? [];

  return (
    <div className="flex w-full flex-col gap-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fuentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <UploadZone
            id="informe-upload-semanal"
            label="Plantilla semanal"
            sourceFile={weekly.sourceFile}
            uploadedAt={weekly.uploadedAt}
            disabled={loading}
            onUpload={onUploadWeekly}
          />
          <UploadZone
            id="informe-upload-mensual"
            label="Resueltas del mes"
            sourceFile={monthly.sourceFile}
            uploadedAt={monthly.uploadedAt}
            disabled={loading}
            onUpload={onUploadMonthly}
          />

          {error && (
            <p className="font-mono text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Edición</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={editing ? "edit" : "locked"}
            onValueChange={(value) => {
              if (value) {
                onEditingChange(value === "edit");
              }
            }}
            className="w-full"
          >
            <ToggleGroupItem value="locked" className="flex-1 font-mono text-xs">
              Bloqueado
            </ToggleGroupItem>
            <ToggleGroupItem value="edit" className="flex-1 font-mono text-xs">
              Editar
            </ToggleGroupItem>
          </ToggleGroup>

          <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
            {saving ? "Guardando" : "Guardado"}
          </p>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="w-full">
                Restablecer deck
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restablecer deck</AlertDialogTitle>
                <AlertDialogDescription>
                  Se descartan los textos, overrides y visibilidades editados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void onResetDeck()}>
                  Restablecer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Páginas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pages.length === 0 && (
            <p className="font-mono text-xs text-muted-foreground">Sin páginas</p>
          )}

          {pages.map((page, index) => {
            const visibleToday = isPageVisible(page, today);
            // Match the canvas: only visible pages are numbered, correlatively.
            const slideNumber = visibleToday
              ? pages.slice(0, index + 1).filter((other) => isPageVisible(other, today)).length
              : null;

            return (
              <div
                key={page.id}
                className="rounded-md border border-border bg-background p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectPage(page.id)}
                    className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate font-mono text-xs text-foreground">
                      {slideNumber ?? "—"}. {page.text.title || page.id}
                    </span>
                    <span className="block truncate font-mono text-[0.65rem] text-muted-foreground">
                      {KIND_LABEL[page.kind] ?? page.kind}
                      {page.supportType ? ` · ${page.supportType}` : ""}
                    </span>
                  </button>

                  {page.autoVisibility === "firstTuesday" && (
                    <Badge variant="outline" className="font-mono text-[0.6rem]">
                      {visibleToday ? "Hoy sí" : "Hoy no"}
                    </Badge>
                  )}
                </div>

                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={visibilityValue(page)}
                  onValueChange={(value) => {
                    if (!value) {
                      return;
                    }

                    const next =
                      value === "auto" ? null : value === "on" ? true : false;
                    onUpdatePage(page.id, { visible: next });
                  }}
                  className="mt-2 w-full"
                  aria-label={`Visibilidad de ${page.text.title || page.id}`}
                >
                  <ToggleGroupItem value="auto" className="flex-1 font-mono text-[0.65rem]">
                    Auto
                  </ToggleGroupItem>
                  <ToggleGroupItem value="on" className="flex-1 font-mono text-[0.65rem]">
                    Ver
                  </ToggleGroupItem>
                  <ToggleGroupItem value="off" className="flex-1 font-mono text-[0.65rem]">
                    Ocultar
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
