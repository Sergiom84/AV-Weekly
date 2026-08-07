import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Volume2, VolumeX } from "lucide-react";
import { DECK_MODULES } from "@shared/deck/registry";
import HomeCover from "@/components/home/HomeCover";
import HomeCard, { type HomeCardSpec } from "@/components/home/HomeCard";
import CursorField from "@/components/home/CursorField";
import { useHoverSound } from "@/hooks/useHoverSound";
import "@/components/home/futura.css";

/** Cards come from the module registry, so a module is declared in one place. */
const CARDS: HomeCardSpec[] = DECK_MODULES.map((module) => ({
  id: module.id,
  name: module.name,
  meta: module.meta,
  description: module.description,
  href: module.route,
  layers: module.layers,
}));

const WARP_MS = 460;

export default function Home() {
  const { play, playSelect, enabled, toggle } = useHoverSound();
  const [, navigate] = useLocation();
  const [warping, setWarping] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(timer.current);
  }, []);

  const handleSelect = useCallback(
    (card: HomeCardSpec) => {
      playSelect(card.id);

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduced) {
        navigate(card.href);
        return;
      }

      setWarping(true);
      timer.current = window.setTimeout(() => navigate(card.href), WARP_MS);
    },
    [navigate, playSelect]
  );

  return (
    <div className="futura">
      <CursorField />

      <button
        type="button"
        className="futura-sound"
        onClick={toggle}
        aria-pressed={enabled}
        title={enabled ? "Desactivar sonido" : "Activar sonido"}
      >
        {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        <span className="sr-only">
          {enabled ? "Desactivar sonido" : "Activar sonido"}
        </span>
      </button>

      <HomeCover title="INDRA" kicker="Panel de servicios" />

      <main className="futura-shell">
        <h2 className="futura-section-label">Módulos</h2>

        <div className="futura-deck">
          {CARDS.map((card) => (
            <HomeCard
              key={card.id}
              card={card}
              onHover={play}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </main>

      {warping && <div className="futura-warp" aria-hidden="true" />}
    </div>
  );
}
