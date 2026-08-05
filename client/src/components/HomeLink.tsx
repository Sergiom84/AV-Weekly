import { Link } from "wouter";

/** Way back to the module home from any inner page. */
export default function HomeLink() {
  return (
    <Link
      href="/"
      className="rounded-md px-2 py-1 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      Inicio
    </Link>
  );
}
