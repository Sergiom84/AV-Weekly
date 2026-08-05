import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Volume2, VolumeX } from "lucide-react";
import HomeCover from "@/components/home/HomeCover";
import HomeCard, { type HomeCardSpec } from "@/components/home/HomeCard";
import CursorField from "@/components/home/CursorField";
import { useHoverSound } from "@/hooks/useHoverSound";
import "@/components/home/futura.css";

const CARDS: HomeCardSpec[] = [
  {
    id: "oficinas",
    name: "Oficinas",
    meta: "Módulo 01",
    description:
      "Espacios, puestos y ocupación. Módulo reservado, todavía sin datos conectados.",
    href: "/oficinas",
    layers: 3,
  },
  {
    id: "informatica",
    name: "Informática",
    meta: "Módulo 02",
    description:
      "Parque, incidencias y sistemas. Módulo reservado, todavía sin datos conectados.",
    href: "/informatica",
    layers: 2,
  },
  {
    id: "compras",
    name: "Compras",
    meta: "Módulo 03",
    description:
      "Pedidos, proveedores y contratación. Módulo reservado, todavía sin datos conectados.",
    href: "/compras",
    layers: 2,
  },
  {
    id: "av",
    name: "AV",
    meta: "Módulo 04",
    description:
      "Informe semanal de Audiovisuales: soporte, detalle por resolución y tendencia.",
    href: "/av",
    layers: 2,
  },
];

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
