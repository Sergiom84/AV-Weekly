import { createContext, useContext } from "react";

/**
 * Whether the deck's charts should play their entrance animation: bars rise
 * bottom-up ("filling a bottle"), year lines draw left to right. False in the
 * editable deck view — a chart re-animating every time an unrelated cell is
 * edited would be distracting. True only inside the presentation overlay,
 * which remounts the active slide so the animation replays on every advance.
 */
const PresentationAnimationContext = createContext(false);

export const PresentationAnimationProvider = PresentationAnimationContext.Provider;

export function usePresentationAnimation(): boolean {
  return useContext(PresentationAnimationContext);
}
