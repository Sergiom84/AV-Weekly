import { oficinasColor } from "../aggregate";
import MensualGroupedPage from "./MensualGroupedPage";
import type { OficinasDataPageProps } from "./PageShell";

/** `1.6` monthly incidents of the branch network. */
export default function MensualIncidenciasPage(props: OficinasDataPageProps) {
  return (
    <MensualGroupedPage
      {...props}
      rows={props.dataset.mensual?.incidencias ?? []}
      series={[
        { key: "resueltas", label: "Resueltas", color: oficinasColor(0) },
        { key: "asignadas", label: "Asignadas", color: oficinasColor(1) },
        { key: "asignaciones", label: "Asignaciones", color: oficinasColor(2) },
      ]}
    />
  );
}
