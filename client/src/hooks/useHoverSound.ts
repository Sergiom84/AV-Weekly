import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Interface cues for the home. Everything is synthesized with the Web Audio API,
 * so no third-party audio ships with the app.
 *
 * Shape taken from the reference UI (`/audio/sounds/click-button.mp3`): a dry
 * percussive tick with a very short noise transient, not a long sweep. Moving
 * across the cards walks up a scale, which is what makes the row feel like one
 * instrument instead of four unrelated noises.
 *
 * Browsers keep an AudioContext suspended until the user interacts with the page,
 * so it is resumed on the first pointer or key event and on every play attempt.
 */

export type HoverTone = "oficinas" | "informatica" | "compras" | "av";

/** Minor pentatonic steps, one per card, low to high. */
const HOVER_PITCH: Record<HoverTone, number> = {
  oficinas: 523.25, // C5
  informatica: 622.25, // D#5
  compras: 698.46, // F5
  av: 830.61, // G#5
};

const STORAGE_KEY = "av-weekly:home-sound";

export function useHoverSound() {
  const contextRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
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

  /** Short burst of noise reused for every transient. */
  const getNoise = useCallback((ctx: AudioContext): AudioBuffer => {
    if (!noiseRef.current) {
      const length = Math.floor(ctx.sampleRate * 0.05);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }

      noiseRef.current = buffer;
    }

    return noiseRef.current;
  }, []);

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

  /** Filtered noise transient: the "tick" at the front of the cue. */
  const transient = useCallback(
    (ctx: AudioContext, at: number, cutoff: number, level: number) => {
      const source = ctx.createBufferSource();
      source.buffer = getNoise(ctx);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(cutoff, at);
      filter.Q.setValueAtTime(1.4, at);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(at);
      source.stop(at + 0.06);
    },
    [getNoise]
  );

  /** Plucked body: a fixed pitch with a fast decay, no sweep. */
  const body = useCallback(
    (
      ctx: AudioContext,
      at: number,
      frequency: number,
      level: number,
      decay: number,
      wave: OscillatorType = "triangle"
    ) => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(frequency * 4, at);

      gain.connect(filter);
      filter.connect(ctx.destination);

      for (const cents of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.detune.setValueAtTime(cents, at);
        osc.frequency.setValueAtTime(frequency, at);
        osc.connect(gain);
        osc.start(at);
        osc.stop(at + decay + 0.02);
      }
    },
    []
  );

  const play = useCallback(
    (tone: HoverTone) => {
      if (!enabled) {
        return;
      }

      const now = performance.now();

      // Sliding across cards must not stack cues on top of each other.
      if (now - lastPlayedAt.current < 70) {
        return;
      }

      const ctx = getContext();

      if (!ctx || ctx.state !== "running") {
        return;
      }

      lastPlayedAt.current = now;

      const at = ctx.currentTime;
      const pitch = HOVER_PITCH[tone];

      transient(ctx, at, pitch * 2.4, 0.05);
      body(ctx, at, pitch, 0.055, 0.13);
    },
    [body, enabled, getContext, transient]
  );

  /** Confirmation on select: the hover note plus a fifth above it. */
  const playSelect = useCallback(
    (tone: HoverTone) => {
      if (!enabled) {
        return;
      }

      const ctx = getContext();

      if (!ctx || ctx.state !== "running") {
        return;
      }

      const at = ctx.currentTime;
      const pitch = HOVER_PITCH[tone];

      transient(ctx, at, 2600, 0.07);
      body(ctx, at, pitch, 0.07, 0.16, "square");
      body(ctx, at + 0.09, pitch * 1.5, 0.06, 0.3, "square");
    },
    [body, enabled, getContext, transient]
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

  return { play, playSelect, enabled, toggle };
}
