import IncidenciasDTPage from "./IncidenciasDTPage";
import type { OficinasDataPageProps } from "./PageShell";

/** `1.1 Incidencias asignadas por territorial`. */
export default function AsignadasDTPage(props: OficinasDataPageProps) {
  return <IncidenciasDTPage {...props} section={props.dataset.asignadas} />;
}
