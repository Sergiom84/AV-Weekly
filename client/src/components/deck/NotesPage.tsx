import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { DeckPage, LayoutBox } from "@shared/deck/core";
import NotesCanvas from "./NotesCanvas";
import SlideHeading from "./SlideHeading";

interface NotesPageProps<TPage extends DeckPage<string, string>> {
  page: TPage;
  editing: boolean;
  onChange: (patch: Partial<TPage>) => void;
  /**
   * Removes this page from the deck entirely. Only offered while editing, and
   * only for pages added by hand: a sheet that ships with the deck template is
   * hidden, never deleted.
   */
  onRemove?: () => void;
}

const ACCEPTED_TYPES = "image/png,image/jpeg,image/gif,image/webp";

/**
 * Free-form slide any department adds by hand: a title plus a canvas where the
 * text block and every uploaded image can be placed and resized at will. No
 * data source behind it — the point is to carry whatever happened that week
 * that the imported sheets don't capture.
 */
export default function NotesPage<TPage extends DeckPage<string, string>>({
  page,
  editing,
  onChange,
  onRemove,
}: NotesPageProps<TPage>) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const images = page.images ?? [];
  const imageLayout = page.imageLayout ?? {};

  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } } as unknown as Partial<TPage>);
  const setBody = setSlot("body");

  const removeImage = (url: string) => {
    const nextLayout = { ...imageLayout };
    delete nextLayout[url];
    onChange({
      images: images.filter((item) => item !== url),
      imageLayout: nextLayout,
    } as Partial<TPage>);
  };

  const setImageBox = (url: string, box: LayoutBox) =>
    onChange({ imageLayout: { ...imageLayout, [url]: box } } as Partial<TPage>);

  const setTextBox = (box: LayoutBox) => onChange({ textBox: box } as Partial<TPage>);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const uploaded: string[] = [];

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/uploads/image", { method: "POST", body: formData });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo subir la imagen");
        }

        const body = (await res.json()) as { url?: string };

        if (body.url) {
          uploaded.push(body.url);
        }
      }

      if (uploaded.length > 0) {
        onChange({ images: [...images, ...uploaded] } as Partial<TPage>);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="@container flex h-full w-full flex-col text-foreground">
      <div className="flex shrink-0 items-start justify-between gap-[1cqi]">
        <div className="min-w-0 flex-1">
          <SlideHeading
            service={page.text.subtitle ?? ""}
            title={page.text.title ?? ""}
            editing={editing}
            onServiceChange={setSlot("subtitle")}
            onTitleChange={setSlot("title")}
          />
        </div>

        {editing && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Eliminar hoja"
            title="Eliminar hoja"
            className="shrink-0 rounded-md border border-border p-[0.4cqi] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="h-[1.6cqi] w-[1.6cqi]" />
          </button>
        )}
      </div>

      <div className="mt-[1.5cqi] flex min-h-0 flex-1 flex-col">
        <NotesCanvas
          body={page.text.body ?? ""}
          textBox={page.textBox}
          images={images}
          imageLayout={imageLayout}
          editing={editing}
          uploading={uploading}
          uploadError={uploadError}
          onBodyChange={setBody}
          onTextBoxChange={setTextBox}
          onImageBoxChange={setImageBox}
          onAddClick={() => fileInputRef.current?.click()}
          onRemoveImage={removeImage}
        />

        {editing && (
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="sr-only"
            onChange={(event) => void handleFiles(event.target.files)}
          />
        )}
      </div>
    </div>
  );
}
