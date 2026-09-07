import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.tsx?$/.test(file)
        ? [file]
        : [];
  });
}

describe("AGA week labels in array callbacks", () => {
  it("does not pass the array index as the optional reportWeek argument", () => {
    const files = sourceFiles(
      path.resolve(import.meta.dirname, "../client/src/modules/aga")
    );
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    let formatterReferences = 0;
    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isIdentifier(node) &&
          ["weekLabel", "weekNumber"].includes(node.text)
        )
          formatterReferences++;
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "map"
        ) {
          const callback = node.arguments[0];
          if (
            callback &&
            ts.isIdentifier(callback) &&
            ["weekLabel", "weekNumber"].includes(callback.text)
          ) {
            const line =
              source.getLineAndCharacterOfPosition(callback.getStart()).line +
              1;
            offenders.push(`${path.relative(process.cwd(), file)}:${line}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(formatterReferences).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
