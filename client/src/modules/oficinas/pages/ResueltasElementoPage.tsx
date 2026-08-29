import ElementoPage from "./ElementoPage";
import type { OficinasDataPageProps } from "./PageShell";

/** `1.2 Incidencias resueltas por elemento`. */
export default function ResueltasElementoPage(props: OficinasDataPageProps) {
  return (
    <ElementoPage
      {...props}
      section={props.dataset.resueltas}
      compactPresentation
    />
  );
}
