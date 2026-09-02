import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Printer } from "lucide-react";
import { isPageVisible } from "@shared/deck/core";
import type { DeckPage } from "@shared/deck/core";
import type { DeckActionResult, DeckStateOf } from "@/hooks/useDeckData";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { printDeckAsPdf } from "@/lib/printDeck";

/** One upload zone: the module resolves which file currently feeds the slot. */
export interface SidebarUpload {
  id: string;
  label: string;
  sourceFile: string | null;
  uploadedAt: string | null;
  /** The slot takes several workbooks at once and the server merges them. */
  multiple?: boolean;
  /** File picker filter. Defaults to ".xlsx,.xls" when omitted. */
  accept?: string;
  onUpload: (files: File[]) => Promise<DeckActionResult>;
}

export interface SidebarExportAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface DeckSidebarProps<TPage extends DeckPage<string, string>> {
  deck: DeckStateOf<TPage> | null;
  uploads: SidebarUpload[];
  /** Human label per page kind, provided by the module registry. */
  kindLabels: Record<string, string>;
  /** localStorage prefix of the collapsed state, one namespace per module. */
  storagePrefix: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onUpdatePage: (pageId: string, patch: Partial<TPage>) => void;
  onResetDeck: () => Promise<DeckActionResult>;
  onSelectPage: (pageId: string) => void;
  /** Opens the fullscreen, one-slide-at-a-time viewer. */
  onPresent: () => void;
  /** Module-specific actions rendered inside the shared Exportar section. */
  exportActions?: SidebarExportAction[];
  /** Module label used to suggest the PDF filename in the print dialog. */
  pdfFilenamePrefix: string;
}

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

interface SidebarSectionProps {
  id: string;
  storagePrefix: string;
  title: string;
  children: React.ReactNode;
}

/** Sidebar card that the user can fold away to shorten the column. */
function SidebarSection({
  id,
  storagePrefix,
  title,
  children,
}: SidebarSectionProps) {
  const storageKey = `${storagePrefix}${id}`;
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(storageKey) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
  }, [collapsed, storageKey]);

  const toggle = useCallback(() => setCollapsed(previous => !previous), []);
  const contentId = `sidebar-section-${id}`;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            className="font-mono text-xs"
          >
            {collapsed ? "Mostrar" : "Ocultar"}
          </Button>
        </div>
      </CardHeader>

      {!collapsed && <div id={contentId}>{children}</div>}
    </Card>
  );
}

/**
 * Number of workbooks the server says it merged, when it reports one.
 * The field is optional on purpose: an older server answers without it and the
 * zone simply falls back to the number of files the user picked.
 */
function readMergedCount(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const report = (payload as { report?: unknown }).report;

  if (!report || typeof report !== "object") {
    return null;
  }

  const { files, fileCount } = report as {
    files?: unknown;
    fileCount?: unknown;
  };

  if (Array.isArray(files)) {
    return files.length;
  }

  if (typeof fileCount === "number" && Number.isFinite(fileCount)) {
    return fileCount;
  }

  return null;
}

interface UploadZoneProps {
  id: string;
  label: string;
  sourceFile: string | null;
  uploadedAt: string | null;
  multiple: boolean;
  accept: string;
  disabled: boolean;
  onUpload: (files: File[]) => Promise<DeckActionResult>;
}

function UploadZone({
  id,
  label,
  sourceFile,
  uploadedAt,
  multiple,
  accept,
  disabled,
  onUpload,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [countLabel, setCountLabel] = useState<string | null>(null);

  const uploadedLabel = formatUploadedAt(uploadedAt);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    const files = multiple ? picked : picked.slice(0, 1);

    if (files.length === 0) {
      return;
    }

    setBusy(true);
    setLocalError(null);
    setCountLabel(null);
    const result = await onUpload(files);
    setBusy(false);

    if (!result.success) {
      setLocalError(result.error ?? "Carga fallida");
    } else if (multiple) {
      const merged = readMergedCount(result.payload) ?? files.length;
      setCountLabel(merged === 1 ? "1 fichero" : `${merged} ficheros`);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Label
          htmlFor={id}
          className="min-w-0 flex-1 basis-[7rem] font-mono text-sm font-semibold leading-snug text-foreground"
        >
          {label}
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
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
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={handleChange}
      />

      <p className="mt-2 min-w-0 break-all font-mono text-xs text-muted-foreground">
        {sourceFile ?? "Sin fichero"}
        {uploadedLabel ? ` · ${uploadedLabel}` : ""}
        {countLabel ? ` · ${countLabel}` : ""}
      </p>

      {localError && (
        <p className="mt-2 font-mono text-xs text-destructive" role="alert">
          {localError}
        </p>
      )}
    </div>
  );
}

/**
 * Deck sidebar shared by every module: sources, editing controls and the page
 * list with its visibility switches. Everything module-specific — the upload
 * zones, the page kind labels and the storage namespace — arrives as props.
 */
export default function DeckSidebar<TPage extends DeckPage<string, string>>({
  deck,
  uploads,
  kindLabels,
  storagePrefix,
  editing,
  onEditingChange,
  loading,
  saving,
  error,
  onUpdatePage,
  onResetDeck,
  onSelectPage,
  onPresent,
  exportActions = [],
  pdfFilenamePrefix,
}: DeckSidebarProps<TPage>) {
  const pages = deck?.pages ?? [];

  return (
    <div className="flex w-full flex-col gap-4">
      <SidebarSection
        id="fuentes"
        storagePrefix={storagePrefix}
        title="Fuentes"
      >
        <CardContent className="space-y-3">
          {uploads.map(slot => (
            <UploadZone
              key={slot.id}
              id={slot.id}
              label={slot.label}
              sourceFile={slot.sourceFile}
              uploadedAt={slot.uploadedAt}
              multiple={slot.multiple ?? false}
              accept={slot.accept ?? ".xlsx,.xls"}
              disabled={loading}
              onUpload={slot.onUpload}
            />
          ))}

          {error && (
            <p className="font-mono text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </SidebarSection>

      <SidebarSection
        id="edicion"
        storagePrefix={storagePrefix}
        title="Edición"
      >
        <CardContent className="space-y-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={editing ? "edit" : "locked"}
            onValueChange={value => {
              if (value) {
                onEditingChange(value === "edit");
              }
            }}
            className="w-full"
          >
            <ToggleGroupItem
              value="locked"
              className="flex-1 font-mono text-xs"
            >
              Bloqueado
            </ToggleGroupItem>
            <ToggleGroupItem value="edit" className="flex-1 font-mono text-xs">
              Editar
            </ToggleGroupItem>
          </ToggleGroup>

          <p
            className="font-mono text-xs text-muted-foreground"
            aria-live="polite"
          >
            {saving ? "Guardando" : "Guardado"}
          </p>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
              >
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
      </SidebarSection>

      <SidebarSection
        id="exportar"
        storagePrefix={storagePrefix}
        title="Exportar"
      >
        <CardContent className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={onPresent}
          >
            <Play className="h-4 w-4" />
            Presentar
          </Button>

          {exportActions.map(action => (
            <Button
              key={action.id}
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={action.onClick}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => printDeckAsPdf(pdfFilenamePrefix)}
          >
            <Printer className="h-4 w-4" />
            Guardar PDF
          </Button>
        </CardContent>
      </SidebarSection>

      <SidebarSection
        id="paginas"
        storagePrefix={storagePrefix}
        title="Páginas"
      >
        <CardContent className="space-y-2">
          {pages.length === 0 && (
            <p className="font-mono text-xs text-muted-foreground">
              Sin páginas
            </p>
          )}

          {pages.map((page, index) => {
            const pageVisible = isPageVisible(page);
            // Match the canvas: only visible pages are numbered, correlatively.
            const slideNumber = pageVisible
              ? pages.slice(0, index + 1).filter(other => isPageVisible(other))
                  .length
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
                      {kindLabels[page.kind] ?? page.kind}
                      {page.supportType ? ` · ${page.supportType}` : ""}
                    </span>
                  </button>

                  <Switch
                    checked={pageVisible}
                    onCheckedChange={checked =>
                      onUpdatePage(page.id, {
                        visible: checked,
                      } as Partial<TPage>)
                    }
                    aria-label={`Mostrar ${page.text.title || page.id}`}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </SidebarSection>
    </div>
  );
}
