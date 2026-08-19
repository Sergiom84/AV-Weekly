import IncidenciasDTPage from "./IncidenciasDTPage";
import type { OficinasDataPageProps } from "./PageShell";

/** `1.2 Incidencias resueltas por territorial`. */
export default function ResueltasDTPage(props: OficinasDataPageProps) {
  return <IncidenciasDTPage {...props} section={props.dataset.resueltas} />;
}
