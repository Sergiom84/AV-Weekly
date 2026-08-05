import EditableText from "./EditableText";

interface SlideHeadingProps {
  /** Service name, rendered as the dominant line, as in the printed report. */
  service: string;
  /** Numbered section title, rendered underneath. */
  title: string;
  editing: boolean;
  onServiceChange: (value: string) => void;
  onTitleChange: (value: string) => void;
}

/** Two-line slide heading shared by every data page of the deck. */
export default function SlideHeading({
  service,
  title,
  editing,
  onServiceChange,
  onTitleChange,
}: SlideHeadingProps) {
  return (
    <header className="shrink-0">
      <h2 className="text-[2.6cqi] font-semibold uppercase leading-tight tracking-wide text-foreground">
        <EditableText
          value={service}
          onChange={onServiceChange}
          editing={editing}
          ariaLabel="Servicio"
          className="block w-full"
        />
      </h2>
      <p className="font-mono text-[1.5cqi] leading-tight text-muted-foreground">
        <EditableText
          value={title}
          onChange={onTitleChange}
          editing={editing}
          ariaLabel="Título de la página"
          className="block w-full"
        />
      </p>
    </header>
  );
}
