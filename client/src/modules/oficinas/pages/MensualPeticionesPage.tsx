import { oficinasColor } from "../aggregate";
import MensualGroupedPage from "./MensualGroupedPage";
import type { OficinasDataPageProps } from "./PageShell";

/** `1.9` monthly IMAC request flow. */
export default function MensualPeticionesPage(props: OficinasDataPageProps) {
  return (
    <MensualGroupedPage
      {...props}
      rows={props.dataset.mensual?.peticiones ?? []}
      series={[
        { key: "peticiones", label: "Peticiones", color: oficinasColor(0) },
        { key: "realizadas", label: "Realizadas", color: oficinasColor(1) },
        { key: "pendientes", label: "Pendientes", color: oficinasColor(2) },
      ]}
    />
  );
}
