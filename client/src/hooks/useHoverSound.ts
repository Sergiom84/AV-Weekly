import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Short synthesized cues for the home cards. Nothing is downloaded: every tone is
 * generated with the Web Audio API, so no third-party audio is shipped with the app.
 *
 * Browsers keep an AudioContext suspended until the user interacts with the page, so
 * the context is resumed on the first pointer or key event and on every play attempt.
 */

export type HoverTone = "oficinas" | "informatica" | "compras" | "av";

interface ToneSpec {
  /** Oscillator waveform. */
  wave: OscillatorType;
  /** Start and end frequency of the sweep, in Hz. */
  from: number;
  to: number;
  /** Total length in seconds. */
  duration: number;
  /** Peak gain, kept low so the cue stays discreet. */
  peak: number;
  /** Low-pass cutoff in Hz. */
  cutoff: number;
  /** Optional detuned second oscillator, in cents. */
  detune?: number;
}

const TONES: Record<HoverTone, ToneSpec> = {
  // Plano técnico: pulso limpio y seco.
  oficinas: { wave: "sine", from: 420, to: 720, duration: 0.16, peak: 0.09, cutoff: 4200 },
  // Terminal: chirrido corto de datos.
  informatica: {
    wave: "square",
    from: 900,
    to: 1500,
    duration: 0.1,
    peak: 0.045,
    cutoff: 2600,
  },
  // Radar: barrido descendente.
  compras: { wave: "triangle", from: 980, to: 340, duration: 0.22, peak: 0.075, cutoff: 3200 },
  // Synthwave: acorde ancho con detune.
  av: {
    wave: "sawtooth",
    from: 220,
    to: 440,
    duration: 0.32,
    peak: 0.06,
    cutoff: 1800,
    detune: 9,
  },
};

const STORAGE_KEY = "av-weekly:home-sound";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useHoverSound() {
  const contextRef = useRef<AudioContext | null>(null);
  const lastPlayedAt = useRef(0);
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  });

  const getContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") {
      return null;
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!Ctor) {
      return null;
    }

    if (!contextRef.current) {
      contextRef.current = new Ctor();
    }

    if (contextRef.current.state === "suspended") {
      void contextRef.current.resume();
    }

    return contextRef.current;
  }, []);

  // The first gesture unlocks playback for the rest of the visit.
  useEffect(() => {
    const unlock = () => {
      getContext();
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [getContext]);

  useEffect(() => {
    return () => {
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, []);

  const play = useCallback(
    (tone: HoverTone) => {
      if (!enabled || prefersReducedMotion()) {
        return;
      }

      const now = performance.now();

      // Sliding across cards must not stack cues on top of each other.
      if (now - lastPlayedAt.current < 90) {
        return;
      }

      const ctx = getContext();

      if (!ctx || ctx.state !== "running") {
        return;
      }

      lastPlayedAt.current = now;

      const spec = TONES[tone];
      const start = ctx.currentTime;
      const end = start + spec.duration;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(spec.peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(spec.cutoff, start);

      gain.connect(filter);
      filter.connect(ctx.destination);

      const detunes = spec.detune ? [-spec.detune, spec.detune] : [0];

      for (const cents of detunes) {
        const osc = ctx.createOscillator();
        osc.type = spec.wave;
        osc.detune.setValueAtTime(cents, start);
        osc.frequency.setValueAtTime(spec.from, start);
        osc.frequency.exponentialRampToValueAtTime(Math.max(spec.to, 1), end);
        osc.connect(gain);
        osc.start(start);
        osc.stop(end + 0.02);
      }
    },
    [enabled, getContext]
  );

  const toggle = useCallback(() => {
    setEnabled((previous) => {
      const next = !previous;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      }

      if (next) {
        getContext();
      }

      return next;
    });
  }, [getContext]);

  return { play, enabled, toggle };
}
