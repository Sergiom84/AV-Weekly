import { componentSeriesColor } from "@/lib/yearSeries";
import MensualGroupedPage from "./MensualGroupedPage";
import type { OficinasDataPageProps } from "./PageShell";

/** `1.6` monthly incidents of the branch network. */
export default function MensualIncidenciasPage(props: OficinasDataPageProps) {
  return (
    <MensualGroupedPage
      {...props}
      rows={props.dataset.mensual?.incidencias ?? []}
      series={[
        { key: "resueltas", label: "Resueltas", color: componentSeriesColor(0, 3) },
        { key: "asignadas", label: "Asignadas", color: componentSeriesColor(1, 3) },
        { key: "asignaciones", label: "Asignaciones", color: componentSeriesColor(2, 3) },
      ]}
    />
  );
}
