import MatrixTable from "@/components/deck/MatrixTable";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { monthLabel, pivot, reportMonths } from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface CitasMensualPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/**
 * `2.3.3 Volumetría de Citas Mensuales SSCC`: appointments per building and
 * month, both types added together, as the printed matrix does.
 */
export default function CitasMensualPage({
  page,
  editing,
  onChange,
  dataset,
}: CitasMensualPageProps) {
  const rows = dataset.citas ?? [];
  const months = reportMonths(dataset, rows, row => row.mes);

  const matrix = pivot(
    rows,
    row => row.edificio,
    row => row.mes,
    row => row.citas,
    { columns: months }
  );

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="min-h-0 flex-1 overflow-auto">
        <MatrixTable
          rowHeader="Edificio"
          columns={months.map(monthLabel)}
          rows={matrix.rows}
        />
      </div>
    </PageShell>
  );
}
