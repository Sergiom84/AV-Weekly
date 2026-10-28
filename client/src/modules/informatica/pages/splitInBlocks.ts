/**
 * A monthly table runs over about twenty sites: one full-width column would
 * shrink its text to nothing, so it reads as a few blocks side by side. The
 * rows keep their order, filled block by block.
 */
export function splitInBlocks<T>(rows: T[], blocks: number): T[][] {
  const size = Math.max(1, Math.ceil(rows.length / blocks));
  const result: T[][] = [];

  for (let start = 0; start < rows.length; start += size) {
    result.push(rows.slice(start, start + size));
  }

  return result;
}
