import Lightning from "./Lightning";

interface HomeCoverProps {
  title: string;
  kicker: string;
}

/**
 * The title arrives from the vanishing point, the way the reference logo does:
 * it starts as a distant flare on the horizon, rushes toward the viewer, and
 * lands with a shockwave. Letters then settle one after another.
 */
export default function HomeCover({ title, kicker }: HomeCoverProps) {
  const letters = Array.from(title);

  return (
    <header className="futura-cover futura-scanlines futura-vignette">
      <div className="futura-sun" aria-hidden="true" />
      <div className="futura-horizon" aria-hidden="true" />
      <Lightning />

      <div className="futura-cover-content">
        <div className="futura-title-stage">
          <div className="futura-flare" aria-hidden="true" />
          <div className="futura-shockwave" aria-hidden="true" />

          <h1 className="futura-title" aria-label={title}>
            <span className="futura-title-face" aria-hidden="true">
              {letters.map((letter, index) => (
                <span
                  key={`${letter}-${index}`}
                  className="futura-title-letter"
                  style={{ "--i": index } as React.CSSProperties}
                >
                  {letter}
                </span>
              ))}
            </span>
            <span className="futura-title-glitch" aria-hidden="true">
              {title}
            </span>
          </h1>
        </div>

        <p className="futura-kicker">{kicker}</p>
      </div>
    </header>
  );
}
