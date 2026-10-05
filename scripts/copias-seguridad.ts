/**
 * Lists, extracts and restores the import backups kept in upload_backup.
 *
 *   pnpm exec tsx --env-file=.env scripts/copias-seguridad.ts listar [departamento]
 *   pnpm exec tsx --env-file=.env scripts/copias-seguridad.ts extraer <id> [carpeta]
 *   pnpm exec tsx --env-file=.env scripts/copias-seguridad.ts restaurar <id> --confirmar
 *
 * Without .env it works on the local data/av-weekly.db. `restaurar` puts the
 * tables back as they were just before that import; it takes a new backup of
 * the current state first, so a restore can be undone the same way.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { resolveDatabaseUrl } from "../server/db-config.ts";
import { createBackup, ensureBackupTables, readItem, restoreBackup } from "../server/uploadBackup.ts";

const url = resolveDatabaseUrl(process.env, path.resolve("data"));
const db = createClient(url.startsWith("file:") ? { url } : { url, authToken: process.env.TOKEN_TURSO });
const [command, arg, extra] = process.argv.slice(2);

await ensureBackupTables(db);
console.log(`Base: ${url.startsWith("file:") ? url : "Turso (producción)"}`);

if (command === "listar") {
  const result = await db.execute({
    sql: `SELECT id, department, action, status, http_status, files, created_at
          FROM upload_backup ${arg ? "WHERE department = ?" : ""}
          ORDER BY id DESC LIMIT 50`,
    args: arg ? [arg] : [],
  });
  for (const row of result.rows) {
    const names = (JSON.parse(row.files as string) as Array<{ name: string }>).map((file) => file.name);
    console.log(
      `${row.id}\t${row.created_at}\t${row.department}\t${row.action}\t${row.status}\t${names.join(", ") || "-"}`
    );
  }
} else if (command === "extraer" && arg) {
  const id = Number(arg);
  const header = await db.execute({ sql: "SELECT files, tables FROM upload_backup WHERE id = ?", args: [id] });
  if (header.rows.length === 0) throw new Error(`No existe la copia ${id}.`);
  const folder = path.resolve(extra ?? `copia-${id}`);
  fs.mkdirSync(folder, { recursive: true });
  const files = JSON.parse(header.rows[0].files as string) as Array<{ item: string; name: string }>;
  for (const file of files) {
    const content = await readItem(db, id, file.item);
    if (content) fs.writeFileSync(path.join(folder, path.basename(file.name)), content);
  }
  for (const table of JSON.parse(header.rows[0].tables as string) as string[]) {
    const content = await readItem(db, id, `table:${table}`);
    if (content) fs.writeFileSync(path.join(folder, `${table}.json`), content);
  }
  console.log(`Copia ${id} extraída en ${folder}`);
} else if (command === "restaurar" && arg && extra === "--confirmar") {
  const id = Number(arg);
  const header = await db.execute({ sql: "SELECT department, tables FROM upload_backup WHERE id = ?", args: [id] });
  if (header.rows.length === 0) throw new Error(`No existe la copia ${id}.`);
  const tables = JSON.parse(header.rows[0].tables as string) as string[];
  const before = await createBackup(db, header.rows[0].department as "av", `antes-de-restaurar-${id}`, [], tables);
  await restoreBackup(db, id);
  console.log(`Restaurada la copia ${id} (${tables.join(", ")}). Estado anterior guardado en la copia ${before}.`);
} else {
  console.log("Uso: listar [departamento] | extraer <id> [carpeta] | restaurar <id> --confirmar");
  process.exitCode = 1;
}
