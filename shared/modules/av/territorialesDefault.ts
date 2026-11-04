/**
 * Default seed data for AV Territorial Events & Installations (Eventos Extr.).
 *
 * Source: Google Sheets "Tendencias AV_2026", tab "Eventos Extr." (gid 1149611901).
 * Verified against the 2026 sheet aggregates.
 */

export interface TerritorialEventMonth {
  mes: string;
  galicia: number;
  norte: number;
  cataluna: number;
  este: number;
  sur: number;
  gc: number;
  centro: number;
  total: number;
}

export interface TerritorialEventsData {
  meses: TerritorialEventMonth[];
  totales: Record<string, number>;
  resumen: string;
  mesActual: string;
}

export const TERRITORIOS_LABELS = [
  "Galicia",
  "Norte",
  "Cataluña",
  "Este",
  "Sur",
  "GC",
  "Centro",
] as const;

export type TerritorioKey = (typeof TERRITORIOS_LABELS)[number];

export const TERRITORIO_COLORS: Record<string, string> = {
  Galicia: "#4285F4",
  Norte: "#EA4335",
  Cataluña: "#9E9E9E",
  Sur: "#1A73E8",
  GC: "#34A853",
  Centro: "#7BAAF7",
  Este: "#00ACC1",
};

export const DEFAULT_TERRITORIALES_DATA: TerritorialEventsData = {
  mesActual: "Octubre",
  resumen:
    "Evento Values day en 6 territoriales.\n\nXXI Comisión Biodiversidad Premios Fronteras (Recoletos)\n\nTown Hall CIB/Alfatech (Tres Cantos).\n\nDestacamos:\n6 - Madrid\n4 - Cataluña y Norte",
  totales: {
    Galicia: 11,
    Norte: 47,
    Cataluña: 31,
    Este: 0,
    Sur: 8,
    GC: 5,
    Centro: 33,
    Total: 135,
  },
  meses: [
    { mes: "Enero", galicia: 4, norte: 8, cataluna: 4, este: 0, sur: 2, gc: 1, centro: 5, total: 24 },
    { mes: "Febrero", galicia: 2, norte: 4, cataluna: 5, este: 0, sur: 0, gc: 0, centro: 6, total: 17 },
    { mes: "Marzo", galicia: 0, norte: 5, cataluna: 4, este: 0, sur: 0, gc: 0, centro: 4, total: 13 },
    { mes: "Abril", galicia: 1, norte: 7, cataluna: 2, este: 0, sur: 0, gc: 0, centro: 2, total: 12 },
    { mes: "Mayo", galicia: 0, norte: 6, cataluna: 3, este: 0, sur: 0, gc: 0, centro: 1, total: 10 },
    { mes: "Junio", galicia: 0, norte: 3, cataluna: 3, este: 0, sur: 0, gc: 2, centro: 6, total: 14 },
    { mes: "Julio", galicia: 1, norte: 5, cataluna: 1, este: 0, sur: 0, gc: 0, centro: 1, total: 8 },
    { mes: "Septiembre", galicia: 2, norte: 5, cataluna: 4, este: 0, sur: 3, gc: 0, centro: 2, total: 16 },
    { mes: "Octubre", galicia: 1, norte: 4, cataluna: 4, este: 0, sur: 3, gc: 2, centro: 6, total: 20 },
    { mes: "Noviembre", galicia: 0, norte: 0, cataluna: 1, este: 0, sur: 0, gc: 0, centro: 0, total: 1 },
  ],
};
