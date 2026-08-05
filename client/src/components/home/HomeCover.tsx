interface HomeCoverProps {
  title: string;
  kicker: string;
}

export default function HomeCover({ title, kicker }: HomeCoverProps) {
  return (
    <header className="futura-cover futura-scanlines futura-vignette">
      <div className="futura-sun" aria-hidden="true" />
      <div className="futura-horizon" aria-hidden="true" />

      <div className="relative z-[4] flex flex-col items-center gap-6">
        <h1 className="futura-title">
          {title}
          <span className="futura-title-glitch" aria-hidden="true">
            {title}
          </span>
        </h1>
        <p className="futura-kicker">{kicker}</p>
      </div>
    </header>
  );
}
