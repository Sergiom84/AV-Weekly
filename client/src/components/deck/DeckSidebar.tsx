import { useCallback, useEffect, useRef, useState } from "react";
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

/** One upload zone: the module resolves which file currently feeds the slot. */
export interface SidebarUpload {
  id: string;
  label: string;
  sourceFile: string | null;
  uploadedAt: string | null;
  onUpload: (file: File) => Promise<DeckActionResult>;
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
function SidebarSection({ id, storagePrefix, title, children }: SidebarSectionProps) {
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

  const toggle = useCallback(() => setCollapsed((previous) => !previous), []);
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

interface UploadZoneProps {
  id: string;
  label: string;
  sourceFile: string | null;
  uploadedAt: string | null;
  disabled: boolean;
  onUpload: (file: File) => Promise<DeckActionResult>;
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
}: DeckSidebarProps<TPage>) {
  const pages = deck?.pages ?? [];

  return (
    <div className="flex w-full flex-col gap-4">
      <SidebarSection id="fuentes" storagePrefix={storagePrefix} title="Fuentes">
        <CardContent className="space-y-3">
          {uploads.map((slot) => (
            <UploadZone
              key={slot.id}
              id={slot.id}
              label={slot.label}
              sourceFile={slot.sourceFile}
              uploadedAt={slot.uploadedAt}
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

      <SidebarSection id="edicion" storagePrefix={storagePrefix} title="Edición">
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
      </SidebarSection>

      <SidebarSection id="paginas" storagePrefix={storagePrefix} title="Páginas">
        <CardContent className="space-y-2">
          {pages.length === 0 && (
            <p className="font-mono text-xs text-muted-foreground">Sin páginas</p>
          )}

          {pages.map((page, index) => {
            const pageVisible = isPageVisible(page);
            // Match the canvas: only visible pages are numbered, correlatively.
            const slideNumber = pageVisible
              ? pages.slice(0, index + 1).filter((other) => isPageVisible(other)).length
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
                    onCheckedChange={(checked) =>
                      onUpdatePage(page.id, { visible: checked } as Partial<TPage>)
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
