import ElementoPage from "./ElementoPage";
import type { OficinasDataPageProps } from "./PageShell";

/** `1.1 Incidencias asignadas por elemento`. */
export default function AsignadasElementoPage(props: OficinasDataPageProps) {
  return <ElementoPage {...props} section={props.dataset.asignadas} />;
}
