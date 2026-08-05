import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  editing: boolean;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  ariaLabel: string;
}

/**
 * Inline editable text slot. Renders plain text when the deck is locked and a
 * borderless field when editing, so the slide layout never shifts.
 */
export default function EditableText({
  value,
  onChange,
  editing,
  className,
  placeholder,
  multiline,
  ariaLabel,
}: EditableTextProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node || !multiline || !editing) {
      return;
    }

    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value, multiline, editing]);

  if (!editing) {
    return (
      <span className={cn("whitespace-pre-wrap", className)}>
        {value || placeholder || ""}
      </span>
    );
  }

  const shared = cn(
    "w-full resize-none rounded-sm bg-transparent outline-none",
    "ring-1 ring-inset ring-border focus:ring-2 focus:ring-ring",
    className
  );

  if (multiline) {
    return (
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        className={shared}
        value={value}
        placeholder={placeholder}
        rows={1}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      aria-label={ariaLabel}
      className={shared}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
