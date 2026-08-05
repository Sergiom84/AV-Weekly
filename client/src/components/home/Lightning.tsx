import { useEffect, useMemo, useState } from "react";

/**
 * Storm bolts over the cover. The reference draws them inside its WebGL scene
 * (`LaserDriftBGStorm.json`); here they are plain SVG polylines that strike on an
 * irregular cadence and leave a short white flash behind.
 */

interface Bolt {
  id: number;
  points: string;
  branch: string;
  delay: number;
}

function buildBolt(id: number, originX: number): Bolt {
  const segments = 9;
  const points: string[] = [];
  let x = originX;
  let y = 0;

  for (let i = 0; i <= segments; i += 1) {
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    x += (Math.random() - 0.5) * 7;
    y += 100 / segments;
  }

  // Short fork peeling off the middle of the trunk.
  const forkAt = Math.floor(segments / 2);
  const [fx, fy] = points[forkAt].split(",").map(Number);
  const branch: string[] = [`${fx},${fy}`];
  let bx = fx;
  let by = fy;

  for (let i = 0; i < 3; i += 1) {
    bx += (Math.random() - 0.5) * 9 - 3;
    by += 9;
    branch.push(`${bx.toFixed(1)},${by.toFixed(1)}`);
  }

  return {
    id,
    points: points.join(" "),
    branch: branch.join(" "),
    delay: 0,
  };
}

export default function Lightning() {
  const [strike, setStrike] = useState<Bolt | null>(null);
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  useEffect(() => {
    if (reduced) {
      return;
    }

    let timer: number;
    let counter = 0;

    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        counter += 1;
        setStrike(buildBolt(counter, 20 + Math.random() * 60));
        window.setTimeout(() => setStrike(null), 900);
        schedule(4200 + Math.random() * 7000);
      }, delay);
    };

    // First strike lands right after the title arrives.
    schedule(1500);

    return () => window.clearTimeout(timer);
  }, [reduced]);

  if (!strike) {
    return null;
  }

  return (
    <div className="futura-storm" aria-hidden="true">
      <div className="futura-storm-flash" />
      <svg
        className="futura-storm-bolt"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        key={strike.id}
      >
        <polyline points={strike.points} className="futura-storm-trunk" />
        <polyline points={strike.branch} className="futura-storm-fork" />
      </svg>
    </div>
  );
}
