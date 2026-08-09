import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

/**
 * Framework adapters declare @sixtyfold/core as an *optional* peer, and their
 * built bundles import nothing from it — every reference is a type that erases
 * at build time. That is what lets an application install an adapter plus one
 * engine and nothing else.
 *
 * A value import from core would quietly break that, which is also why the
 * per-package `shared.ts` helpers stay duplicated instead of moving into core.
 */
const ADAPTER_SOURCE_ROOTS = [
  "packages/react/src",
  "packages/vue/src",
  "packages/solid/src",
  "packages/svelte/src",
  "packages/angular/src",
  "packages/angular/line",
  "packages/angular/stock",
];
const ADAPTER_EXTENSIONS = new Set([".ts", ".tsx", ".svelte"]);

// The clause cannot contain a quote, so a match can never span the specifier
// of a preceding import statement.
const IMPORT_STATEMENT = /import\s+([^"']*?)\s*from\s*["']([^"']+)["']/g;
const CORE_SIDE_EFFECT_IMPORT = /import\s+["']@sixtyfold\/core[^"']*["']/;

/** Prose mentioning "import" would otherwise be scanned as code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "");
}

async function adapterSourceFiles(): Promise<string[]> {
  const files: string[] = [];

  async function visit(relativeDirectory: string): Promise<void> {
    for (const entry of await readdir(resolve(root, relativeDirectory), { withFileTypes: true })) {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(relativePath);
        continue;
      }
      const extension = entry.name.slice(entry.name.lastIndexOf("."));
      if (ADAPTER_EXTENSIONS.has(extension) && !entry.name.includes(".test.")) {
        files.push(relativePath);
      }
    }
  }

  for (const directory of ADAPTER_SOURCE_ROOTS) await visit(directory);
  return files.sort();
}

describe("framework adapters", () => {
  it("import @sixtyfold/core for types only", async () => {
    const files = await adapterSourceFiles();
    // Guard against the glob silently matching nothing.
    expect(files.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(await readFile(resolve(root, file), "utf8"));
      if (CORE_SIDE_EFFECT_IMPORT.test(source)) {
        offenders.push(`${file}: side-effect import of @sixtyfold/core`);
      }
      for (const [, clause, specifier] of source.matchAll(IMPORT_STATEMENT)) {
        if (!specifier!.startsWith("@sixtyfold/core")) continue;
        if (!/^type\b/.test(clause!.trim())) {
          offenders.push(`${file}: value import from ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
