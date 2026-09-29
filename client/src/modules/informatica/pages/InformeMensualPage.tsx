import KpiRow from "@/components/deck/KpiRow";
import MatrixTable from "@/components/deck/MatrixTable";
import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monthName, PETICIONES_ORIGENES } from "@shared/modules/informatica/mensual";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { decimal, monthLabel } from "../aggregate";
import { informeMensualView } from "../informeMensual";
import { COLOR_2025, COLOR_2026 } from "../palette";
import PageShell, { type InformaticaPageProps } from "./PageShell";
import { ComponentsChart } from "./TopTenIncidenciasPage";

interface InformeMensualPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

function count(value: number | null): string {
  return value === null ? EMPTY_TABLE_CELL : value.toLocaleString("es-ES");
}

/** A zero measured is a zero: the sites are listed so a quiet one shows it. */
const plainCount = (value: number) => String(value);

function BlockTitle({ children }: { children: string }) {
  return (
    <h3 className="shrink-0 pb-[0.3cqi] font-mono text-[1.15cqi] font-medium text-muted-foreground">
      {children}
    </h3>
  );
}

/** Closing slide of Informática: one month, the blocks of the monthly brief, and the charts behind them. */
export default function InformeMensualPage({
  page,
  editing,
  onChange,
  dataset,
}: InformeMensualPageProps) {
  const { informe, months } = informeMensualView(dataset, page);
  const current = informe.month ? monthLabel(informe.month) : "Mes";
  const previous = informe.previousMonth ? monthLabel(informe.previousMonth) : "Anterior";
  const renovados = informe.renove.espana + informe.renove.holding;

  const peticiones = (
    [
      ["Backlog", "backlog"],
      ["Liberadas", "liberadas"],
      ["Gestionadas", "gestionadas"],
    ] as const
  ).map(([label, key]) => ({
    label,
    // NaN is "not uploaded": it prints as a hyphen and keeps the total blank.
    values: informe.peticiones.map((row) => row[key] ?? Number.NaN),
  }));

  const comparison = [previous, current];
  const topRows = informe.topTen.map((row) => ({
    label: row.categoria,
    values: [row.anterior ?? 0, row.total],
  }));
  // The template keeps two months of SLA results; without the earlier one the
  // comparison series would draw a row of zeros that were never measured.
  const slaCompared = informe.slas.some((row) => row.anterior !== null);
  const slaRows = informe.slas
    .filter((row) => row.share !== null)
    .map((row) => {
      const now = Math.round((row.share ?? 0) * 100);

      return {
        label: row.label,
        values: slaCompared
          ? [row.anterior === null ? 0 : Math.round(row.anterior * 100), now]
          : [now],
      };
    });

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      hideFootnote
      editor={
        editing &&
        months.length > 0 && (
          <Select
            value={informe.month ?? undefined}
            onValueChange={(month) =>
              onChange({ monthSelection: { mode: "range", from: month, to: month, months: [] } })
            }
          >
            <SelectTrigger
              size="sm"
              aria-label="Mes del informe"
              className="h-7 w-40 font-mono text-xs capitalize"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...months].reverse().map((month) => (
                <SelectItem key={month} value={month} className="font-mono text-xs capitalize">
                  {monthName(month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
    >
      <p className="shrink-0 font-mono text-[1.4cqi] font-medium capitalize">
        {informe.month ? monthName(informe.month) : EMPTY_TABLE_CELL}
      </p>

      <KpiRow
        compact
        items={[
          { label: "Resueltas", value: count(informe.incidencias.resueltas), accent: COLOR_2026 },
          { label: "Abiertas", value: count(informe.incidencias.abiertas), accent: COLOR_2026 },
          { label: "Backlog", value: count(informe.incidencias.backlog), accent: COLOR_2026 },
          { label: "Encuestas", value: count(informe.encuestas.numero) },
          {
            label: "Promedio",
            value:
              informe.encuestas.promedio === null
                ? EMPTY_TABLE_CELL
                : decimal(informe.encuestas.promedio),
          },
          { label: "IMACS sol.", value: count(informe.imacs.solicitudes) },
          { label: "IMACS trab.", value: count(informe.imacs.trabajos) },
          { label: "Renove", value: count(renovados), accent: COLOR_2025 },
          { label: "España", value: count(informe.renove.espana) },
          { label: "Holding", value: count(informe.renove.holding) },
        ]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.05fr)_minmax(0,1.05fr)_minmax(0,0.85fr)_minmax(0,0.95fr)] grid-rows-[minmax(0,1fr)_auto] gap-[1cqi]">
        <section className="flex min-h-0 min-w-0 flex-col" aria-label="Top ten de incidencias">
          <BlockTitle>Top ten incidencias</BlockTitle>
          <ComponentsChart
            rows={topRows}
            columns={comparison}
            ariaLabel="Top ten de incidencias frente al mes anterior"
          />
        </section>

        <section className="flex min-h-0 min-w-0 flex-col" aria-label="Cumplimiento de SLA">
          <BlockTitle>SLA (%)</BlockTitle>
          {slaRows.length > 0 && (
            <ComponentsChart
              rows={slaRows}
              columns={slaCompared ? comparison : [current]}
              ariaLabel="Cumplimiento de SLA frente al mes anterior"
            />
          )}
        </section>

        <section
          className="row-span-2 flex min-h-0 min-w-0 flex-col"
          aria-label="Work orders por sede"
        >
          <BlockTitle>Work orders</BlockTitle>
          <div className="min-h-0 flex-1">
            <MatrixTable
              rowHeader="Sede"
              columns={["Work orders"]}
              rows={informe.workOrders.map((row) => ({ label: row.site, values: [row.total] }))}
              rowTotals={false}
              variant="report"
              formatValue={plainCount}
            />
          </div>
        </section>

        <section
          className="row-span-2 flex min-h-0 min-w-0 flex-col"
          aria-label="Citas Smart Tech por sede"
        >
          <BlockTitle>Smart Tech</BlockTitle>
          <div className="min-h-0 flex-1">
            <MatrixTable
              rowHeader="Sede"
              columns={["Con cita", "Sin cita"]}
              rows={informe.smartTech.map((row) => ({
                label: row.site,
                values: [row.conCita, row.sinCita],
              }))}
              variant="report"
              formatValue={plainCount}
            />
          </div>
        </section>

        <section className="col-span-2 min-w-0" aria-label="Peticiones del mes">
          <BlockTitle>Peticiones</BlockTitle>
          <MatrixTable
            rowHeader="Origen"
            columns={[...PETICIONES_ORIGENES]}
            rows={peticiones}
            columnTotals={false}
            totalsLabel="Totales"
            variant="report"
            fill={false}
            formatValue={(value) => (Number.isNaN(value) ? EMPTY_TABLE_CELL : String(value))}
          />
        </section>
      </div>
    </PageShell>
  );
}
