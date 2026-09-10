import { componentSeriesColor } from "@/lib/yearSeries";
import MensualGroupedPage from "./MensualGroupedPage";
import type { OficinasDataPageProps } from "./PageShell";

/** `1.9` monthly IMAC request flow. */
export default function MensualPeticionesPage(props: OficinasDataPageProps) {
  return (
    <MensualGroupedPage
      {...props}
      rows={props.dataset.mensual?.peticiones ?? []}
      series={[
        { key: "peticiones", label: "Peticiones", color: componentSeriesColor(0, 3) },
        { key: "realizadas", label: "Realizadas", color: componentSeriesColor(1, 3) },
        { key: "pendientes", label: "Pendientes", color: componentSeriesColor(2, 3) },
      ]}
    />
  );
}
