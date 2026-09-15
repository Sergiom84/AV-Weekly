import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Play, Printer, Trash2 } from "lucide-react";
import { isPageVisible } from "@shared/deck/core";
import type { DeckPage } from "@shared/deck/core";
import { filenameFromDisposition } from "@shared/deck/pdf-download";
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
import { Textarea } from "@/components/ui/textarea";
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
  /** Paste the Drive PLANO tab as text, skipping the file picker. */
  onPasteTexto?: (texto: string) => Promise<DeckActionResult>;
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
  /**
   * Endpoint that renders the deck server-side, e.g. `/api/aga/pdf`.
   *
   * The two export buttons are not redundant. Printing keeps the preview and
   * the page controls, but the name of the resulting file belongs to the
   * browser and to the print driver: with "Microsoft Print to PDF" the Windows
   * save dialog comes up empty however the document is titled. This one is a
   * real download, so `Content-Disposition` names it, at the cost of a
   * server-side render that takes its time and admits one export at a time.
   */
  pdfHref: string;
}

/** Lines shown in the paste box until the colleague expands it. */
const PASTE_PREVIEW_LINES = 8;

function previewPastedTexto(texto: string): string {
  let seen = 0;

  for (let index = 0; index < texto.length; index += 1) {
    if (texto.charCodeAt(index) === 10) {
      seen += 1;

      if (seen === PASTE_PREVIEW_LINES) {
        return texto.slice(0, index);
      }
    }
  }

  return texto;
}

function isLongPastedTexto(texto: string): boolean {
  if (texto === "") {
    return false;
  }

  let lines = 1;

  for (let index = 0; index < texto.length; index += 1) {
    if (texto.charCodeAt(index) === 10) {
      lines += 1;

      if (lines > PASTE_PREVIEW_LINES) {
        return true;
      }
    }
  }

  return false;
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
  onPasteTexto?: (texto: string) => Promise<DeckActionResult>;
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
  onPasteTexto,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [countLabel, setCountLabel] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [pasteExpanded, setPasteExpanded] = useState(false);
  const pasteId = `${id}-pegar`;
  const pasteLong = isLongPastedTexto(pasted);
  const pastePreview = pasteLong && !pasteExpanded;

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

  const handlePaste = async () => {
    const texto = pasted.trim();

    if (!onPasteTexto || texto === "") {
      return;
    }

    setBusy(true);
    setLocalError(null);
    setCountLabel(null);
    const result = await onPasteTexto(texto);
    setBusy(false);

    if (!result.success) {
      setLocalError(result.error ?? "Carga fallida");
      return;
    }

    setPasted("");
    setPasteExpanded(false);
  };

  const capturePastedTexto = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const texto = event.clipboardData.getData("text");

    if (texto === "") {
      return;
    }

    event.preventDefault();
    setPasted(texto);
    setPasteExpanded(false);
    setLocalError(null);
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

      {onPasteTexto && (
        <div className="mt-3 space-y-2">
          <Label
            htmlFor={pasteId}
            className="font-mono text-sm font-semibold leading-snug text-foreground"
          >
            Pegar
          </Label>
          <Textarea
            id={pasteId}
            value={pastePreview ? previewPastedTexto(pasted) : pasted}
            readOnly={pastePreview}
            disabled={disabled || busy}
            onChange={event => {
              if (pastePreview) {
                return;
              }

              setPasted(event.target.value);
            }}
            onPaste={capturePastedTexto}
            onKeyDown={event => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                void handlePaste();
              }
            }}
            className={
              pastePreview
                ? "min-h-[6.5rem] resize-none font-mono text-xs"
                : "min-h-[6.5rem] resize-y font-mono text-xs"
            }
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {pasteLong ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="font-mono text-xs"
                disabled={disabled || busy}
                onClick={() => setPasteExpanded(open => !open)}
              >
                {pasteExpanded ? "Contraer" : "Expandir"}
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto shrink-0"
              disabled={disabled || busy || pasted.trim() === ""}
              onClick={() => void handlePaste()}
            >
              {busy ? "Cargando" : "Cargar"}
            </Button>
          </div>
        </div>
      )}

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
  pdfHref,
}: DeckSidebarProps<TPage>) {
  const pages = deck?.pages ?? [];
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // A ref as well as the state: two clicks in the same render would both pass
  // the state check and start two renders on a server that allows one.
  const pdfLock = useRef(false);

  const downloadPdf = useCallback(async () => {
    if (pdfLock.current) {
      return;
    }

    pdfLock.current = true;
    setPdfBusy(true);
    setPdfError(null);

    try {
      const response = await fetch(pdfHref);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        setPdfError(body?.error ?? "No se pudo generar el PDF");
        return;
      }

      if (!(response.headers.get("content-type") ?? "").includes("pdf")) {
        setPdfError("No se pudo generar el PDF");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filenameFromDisposition(
        response.headers.get("content-disposition"),
        "informe.pdf"
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError("No se pudo generar el PDF");
    } finally {
      pdfLock.current = false;
      setPdfBusy(false);
    }
  }, [pdfHref]);

  const manualCorrections = pages.flatMap((page, index) => {
    const pageVisible = isPageVisible(page);
    const slideNumber = pageVisible
      ? pages.slice(0, index + 1).filter(other => isPageVisible(other)).length
      : null;

    return Object.entries(page.overrides ?? {}).map(([key, value]) => ({
      page,
      slideNumber,
      key,
      value,
    }));
  });

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
              onPasteTexto={slot.onPasteTexto}
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
        id="correcciones"
        storagePrefix={storagePrefix}
        title={`Correcciones manuales (${manualCorrections.length})`}
      >
        <CardContent className="space-y-2">
          {manualCorrections.length === 0 && (
            <p className="font-mono text-xs text-muted-foreground">
              Sin correcciones
            </p>
          )}

          {manualCorrections.map(({ page, slideNumber, key, value }) => (
            <div
              key={`${page.id}:${key}`}
              className="flex items-start gap-2 rounded-md border border-border bg-background p-2"
            >
              <button
                type="button"
                onClick={() => onSelectPage(page.id)}
                className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block truncate font-mono text-xs text-foreground">
                  Slide {slideNumber ?? "oculta"} ·{" "}
                  {key.replaceAll(":", " · ").replaceAll("|", " · ")}
                </span>
                <span className="block truncate font-mono text-[0.65rem] text-muted-foreground">
                  {page.text.title || page.id} · {value ?? "Vacío"}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!editing}
                aria-label={`Quitar corrección ${key}`}
                onClick={() => {
                  const overrides = { ...page.overrides };
                  delete overrides[key];
                  onUpdatePage(page.id, { overrides } as Partial<TPage>);
                }}
                className="h-7 w-7 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
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
            disabled={pdfBusy}
            aria-busy={pdfBusy}
            onClick={() => void downloadPdf()}
          >
            <Download className="h-4 w-4" />
            {pdfBusy ? "Generando" : "Descargar PDF"}
          </Button>

          {pdfError && (
            <p className="font-mono text-xs text-destructive" role="alert">
              {pdfError}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => printDeckAsPdf(pdfFilenamePrefix)}
          >
            <Printer className="h-4 w-4" />
            Imprimir
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
