import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SlideFrameProps {
  children: ReactNode;
  /** Page number shown in the corner. Hidden when null. */
  number?: number | null;
  className?: string;
  /** Dimmed treatment for pages currently hidden from the deck. */
  muted?: boolean;
  /** Full-bleed background image, drawn behind the padded content. */
  background?: string;
}

/**
 * Fixed 16:9 canvas every deck page renders into, so the on-screen layout
 * matches the exported slide. Scales with the container width.
 */
export default function SlideFrame({
  children,
  number,
  className,
  muted,
  background,
}: SlideFrameProps) {
  return (
    <div
      data-deck-frame
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border bg-background shadow-sm",
        muted && "opacity-50",
        className
      )}
      style={{ aspectRatio: "16 / 9" }}
    >
      {background && (
        <img
          src={background}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 flex flex-col p-[3.5%]">{children}</div>
      {number != null && (
        <span className="absolute bottom-[1.5%] right-[2%] font-mono text-[0.7vw] text-muted-foreground">
          {number}
        </span>
      )}
    </div>
  );
}
