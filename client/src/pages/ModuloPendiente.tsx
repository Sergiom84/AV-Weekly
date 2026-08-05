import { Link } from "wouter";
import "@/components/home/futura.css";

interface ModuloPendienteProps {
  name: string;
  meta: string;
}

/** Placeholder for the modules that have no dataset behind them yet. */
export default function ModuloPendiente({ name, meta }: ModuloPendienteProps) {
  return (
    <div className="futura futura-scanlines futura-vignette">
      <section className="futura-standby">
        <div className="futura-horizon" aria-hidden="true" />

        <div className="futura-standby-panel relative z-[4]">
          <p className="futura-card-meta">{meta}</p>
          <h1 className="futura-card-name mt-4 text-2xl">{name}</h1>
          <p className="futura-card-desc mt-6 !opacity-100 !translate-y-0 mx-auto">
            Módulo reservado. Todavía no hay datos conectados.
          </p>
          <Link href="/" className="futura-back">
            Volver
          </Link>
        </div>
      </section>
    </div>
  );
}
