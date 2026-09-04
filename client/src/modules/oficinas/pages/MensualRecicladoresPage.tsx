import { oficinasColor } from "../aggregate";
import MensualGroupedPage from "./MensualGroupedPage";
import type { OficinasDataPageProps } from "./PageShell";

/** `1.7` monthly recycler openings versus closures. */
export default function MensualRecicladoresPage(props: OficinasDataPageProps) {
  return (
    <MensualGroupedPage
      {...props}
      rows={props.dataset.mensual?.recicladores ?? []}
      series={[
        { key: "abiertas", label: "Abiertas", color: oficinasColor(0) },
        { key: "resueltas", label: "Resueltas", color: oficinasColor(1) },
      ]}
    />
  );
}
