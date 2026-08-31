import MatrixTable from "@/components/deck/MatrixTable";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { monthLabel, pivot, reportMonths } from "../aggregate";
import { siteLabels, smartTechSite } from "../sources";
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

  // Same naming as the weekly slide, so both citas tables read the same rows.
  // The full master list is not forced here: a blank row across sixteen month
  // columns says nothing, and a point absent from the whole history is outside
  // the report rather than idle inside it.
  const { labelOf, order: rowOrder } = siteLabels(
    dataset.edificios ?? [],
    row => row.aliasSmartTech,
    rows.map(row => row.edificio),
    { clean: smartTechSite }
  );
  const matrix = pivot(
    rows,
    row => labelOf(row.edificio),
    row => row.mes,
    row => row.citas,
    { columns: months, rowOrder }
  );

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="min-h-0 flex-1 overflow-hidden">
        <MatrixTable
          rowHeader="SmartTech"
          columns={months.map(monthLabel)}
          rows={matrix.rows}
          variant="report"
        />
      </div>
    </PageShell>
  );
}
