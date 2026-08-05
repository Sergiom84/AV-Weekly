import type { HoverTone } from "@/hooks/useHoverSound";

export interface HomeCardSpec {
  id: HoverTone;
  name: string;
  meta: string;
  description: string;
  href: string;
  /** Number of decorative layers the skin renders. */
  layers: 1 | 2 | 3;
}

interface HomeCardProps {
  card: HomeCardSpec;
  onHover: (tone: HoverTone) => void;
  onSelect: (card: HomeCardSpec) => void;
}

export default function HomeCard({ card, onHover, onSelect }: HomeCardProps) {
  return (
    <button
      type="button"
      className={`futura-card futura-skin-${card.id}`}
      onMouseEnter={() => onHover(card.id)}
      onFocus={() => onHover(card.id)}
      onClick={() => onSelect(card)}
    >
      <span className="futura-card-inner" aria-hidden="true">
        <span className="futura-layer" />
        {card.layers >= 2 && <span className="futura-layer-2" />}
        {card.layers >= 3 && <span className="futura-layer-3" />}
      </span>

      <span className="futura-brackets" aria-hidden="true" />

      <span className="futura-card-body">
        <span className="futura-card-meta">{card.meta}</span>
        <span className="futura-card-name">{card.name}</span>
        <span className="futura-card-desc">{card.description}</span>
      </span>
    </button>
  );
}
