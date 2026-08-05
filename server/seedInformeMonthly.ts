import 'dotenv/config';
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { InformeMonthlyDataset, SupportType } from "../shared/informe.ts";
import { INFORME_SUPPORT_TYPES } from "../shared/informe.ts";
import { client, initDb } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_FILE_NAME = "tendencia-mensual.json";
const SEED_PATH = path.resolve(__dirname, "..", "data", "seeds", SEED_FILE_NAME);

interface SeedFile {
  years: number[];
  byType: Record<string, Record<string, unknown>>;
}

/** Reads and validates the seed file, returning a normalized dataset. */
function buildDatasetFromSeed(): InformeMonthlyDataset {
  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(`No se encuentra el fichero de datos: ${SEED_PATH}`);
  }

  let seed: SeedFile;

  try {
    seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as SeedFile;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`El fichero ${SEED_FILE_NAME} no es un JSON válido: ${detail}`);
  }

  if (!Array.isArray(seed?.years) || seed.years.length === 0) {
    throw new Error(`El fichero ${SEED_FILE_NAME} no declara la lista de años.`);
  }

  if (!seed.byType || typeof seed.byType !== "object") {
    throw new Error(`El fichero ${SEED_FILE_NAME} no declara el bloque "byType".`);
  }

  const years = [...seed.years].sort((a, b) => a - b);
  const byType = {} as Record<SupportType, Record<string, (number | null)[]>>;

  for (const type of INFORME_SUPPORT_TYPES) {
    const rawType = seed.byType[type];

    if (!rawType || typeof rawType !== "object") {
      throw new Error(`Falta el tipo de soporte "${type}" en ${SEED_FILE_NAME}.`);
    }

    const seriesByYear: Record<string, (number | null)[]> = {};

    for (const year of years) {
      const rawValues = (rawType as Record<string, unknown>)[String(year)];

      if (!Array.isArray(rawValues)) {
        throw new Error(`Falta la serie del tipo "${type}" para el año ${year}.`);
      }

      if (rawValues.length !== 12) {
        throw new Error(
          `La serie del tipo "${type}" del año ${year} tiene ${rawValues.length} valores y debe tener 12.`
        );
      }

      const values = rawValues.map((value, index) => {
        if (value === null) {
          return null;
        }

        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error(
            `Valor no válido en el tipo "${type}", año ${year}, mes ${index + 1}: se esperaba un número o null.`
          );
        }

        return value;
      });

      seriesByYear[String(year)] = values;
    }

    byType[type] = seriesByYear;
  }

  return {
    byType,
    years,
    sourceFile: SEED_FILE_NAME,
    uploadedAt: new Date().toISOString(),
  };
}

async function hasStoredMonthly(): Promise<boolean> {
  const result = await client.execute("SELECT id FROM informe_monthly WHERE id = 1");

  return result.rows.length > 0;
}

async function main() {
  const force = process.argv.slice(2).includes("--force");
  const dataset = buildDatasetFromSeed();

  await initDb();

  if (!force && (await hasStoredMonthly())) {
    console.error(
      "Ya hay una tendencia mensual guardada en la base de datos. No se sobrescribe nada. Vuelve a ejecutar con --force si quieres reemplazarla."
    );
    process.exitCode = 1;
    return;
  }

  await client.execute({
    sql: `INSERT INTO informe_monthly (id, data, source_file, uploaded_at)
          VALUES (1, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE
          SET data = excluded.data,
              source_file = excluded.source_file,
              uploaded_at = excluded.uploaded_at`,
    args: [JSON.stringify(dataset), dataset.sourceFile],
  });

  console.log(`Tendencia mensual cargada desde ${SEED_FILE_NAME}.`);
  console.log(`Años: ${dataset.years.join(", ")}`);

  for (const type of INFORME_SUPPORT_TYPES) {
    const years = Object.keys(dataset.byType[type]).sort();
    const total = years.reduce(
      (sum, year) => sum + dataset.byType[type][year].filter((value) => value !== null).length,
      0
    );

    console.log(`  ${type}: ${years.length} años, ${total} meses con dato`);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error al cargar la tendencia mensual: ${message}`);
  process.exit(1);
});
