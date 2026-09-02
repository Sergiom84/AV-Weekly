import { spellingKey, type OficinasRow } from "@shared/modules/oficinas/types";

function typeKey(label: string): string {
  const key = spellingKey(label);

  // The historic workbook shortens the current ticket category
  // "SUSTITUCIÓN DE TERMINAL YA GENERADO" to "SUSTITUCION". This is the
  // only semantic alias supported; every other join remains orthographic.
  return key.startsWith("SUSTITUCION") ? "SUSTITUCION" : key;
}

export function previousTypeEntries(
  current: OficinasRow[],
  previous: OficinasRow[],
  previousYear: number,
  week: number
): { label: string; imported: number | null }[] {
  const byType = new Map(previous.map(row => [typeKey(row.label), row]));

  return current.map(row => {
    const historic = byType.get(typeKey(row.label));
    const cell = historic?.values.find(
      entry => entry.year === previousYear && entry.week === week
    );

    return { label: row.label, imported: cell?.value ?? null };
  });
}
