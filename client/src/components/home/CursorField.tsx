import { useEffect, useRef } from "react";

/**
 * Recreates the two pointer-driven layers of the reference background scene
 * (`LaserDriftBGStorm.json`, inspected live):
 *
 *  - `gradient`  → trackMouse 0.07, mouseMomentum 0.88: a soft glow that lags far
 *                  behind the pointer. Rendered as a translated radial gradient.
 *  - `mouseDraw` → trackMouse 0.26, mouseMomentum 0.33, usesPingPong true: an
 *                  electric stroke drawn along the pointer path that decays every
 *                  frame. Rendered on a 2D canvas with a destination-out fade,
 *                  which is the same idea as the reference ping-pong buffer.
 *
 * Both sit behind the cover title and the cards.
 */

const GLOW_TRACK = 0.07;
const GLOW_MOMENTUM = 0.88;
const TRAIL_TRACK = 0.26;
const TRAIL_MOMENTUM = 0.33;
const FADE_PER_FRAME = 0.075;

export default function CursorField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const glow = glowRef.current;

    if (!canvas || !glow) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    let width = 0;
    let height = 0;
    let ratio = 1;

    const resize = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();

    const target = { x: width / 2, y: height / 2 };
    const trail = { x: target.x, y: target.y, vx: 0, vy: 0 };
    const soft = { x: target.x, y: target.y, vx: 0, vy: 0 };
    let previous = { x: trail.x, y: trail.y };
    let pointerSeen = false;

    const onPointerMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
      pointerSeen = true;
    };

    let frame = 0;

    const step = () => {
      frame = requestAnimationFrame(step);

      // Damped spring, the same shape as trackMouse/mouseMomentum in the scene.
      trail.vx = trail.vx * TRAIL_MOMENTUM + (target.x - trail.x) * TRAIL_TRACK;
      trail.vy = trail.vy * TRAIL_MOMENTUM + (target.y - trail.y) * TRAIL_TRACK;
      trail.x += trail.vx;
      trail.y += trail.vy;

      soft.vx = soft.vx * GLOW_MOMENTUM + (target.x - soft.x) * GLOW_TRACK;
      soft.vy = soft.vy * GLOW_MOMENTUM + (target.y - soft.y) * GLOW_TRACK;
      soft.x += soft.vx;
      soft.y += soft.vy;

      glow.style.transform = `translate3d(${soft.x - width / 2}px, ${soft.y - height / 2}px, 0)`;

      // Decay the buffer instead of clearing it: that is what leaves the trail.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0, 0, 0, ${FADE_PER_FRAME})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      const speed = Math.hypot(trail.vx, trail.vy);

      if (pointerSeen && speed > 0.4) {
        // Perpendicular jitter scaled by speed gives the stroke its electric break-up.
        const nx = -trail.vy / (speed || 1);
        const ny = trail.vx / (speed || 1);
        const jitter = Math.min(speed * 0.35, 14);
        const midX = (previous.x + trail.x) / 2 + nx * (Math.random() - 0.5) * jitter;
        const midY = (previous.y + trail.y) / 2 + ny * (Math.random() - 0.5) * jitter;

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.quadraticCurveTo(midX, midY, trail.x, trail.y);

        ctx.strokeStyle = `rgba(242, 4, 97, ${Math.min(0.1 + speed * 0.02, 0.5)})`;
        ctx.lineWidth = Math.min(6 + speed * 0.5, 22);
        ctx.stroke();

        ctx.strokeStyle = `rgba(168, 85, 247, ${Math.min(0.18 + speed * 0.02, 0.6)})`;
        ctx.lineWidth = Math.min(3 + speed * 0.2, 9);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.12 + speed * 0.03, 0.75)})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      previous = { x: trail.x, y: trail.y };
    };

    frame = requestAnimationFrame(step);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <div ref={glowRef} className="futura-pointer-glow" aria-hidden="true" />
      <canvas ref={canvasRef} className="futura-pointer-trail" aria-hidden="true" />
    </>
  );
}
