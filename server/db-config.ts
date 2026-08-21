import path from "node:path";

/** Resolves the remote Turso URL, retaining SQL_TURSO for local compatibility. */
export function resolveDatabaseUrl(
  env: Readonly<Record<string, string | undefined>>,
  localDataDir: string
): string {
  return (
    env.URL_TURSO?.trim() ||
    env.SQL_TURSO?.trim() ||
    `file:${path.join(localDataDir, "av-weekly.db")}`
  );
}
