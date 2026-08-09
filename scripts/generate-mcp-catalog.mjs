#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_DIRECTORIES } from "./release-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "packages/mcp/knowledge/api-reference.json");
const packageDirectories = PACKAGE_DIRECTORIES.filter((directory) => directory !== "mcp");
const command = process.argv[2] ?? "check";

if (!new Set(["generate", "check"]).has(command)) {
  throw new Error("Usage: node scripts/generate-mcp-catalog.mjs <generate|check>");
}

const ts = await import("typescript");
const entryPoints = [];
const packageMetadata = new Map();

for (const directory of packageDirectories) {
  const packageDirectory = path.join(root, "packages", directory);
  const sourceManifest = JSON.parse(
    await readFile(path.join(packageDirectory, "package.json"), "utf8"),
  );
  const exportManifestPath =
    directory === "angular"
      ? path.join(packageDirectory, "dist/package.json")
      : path.join(packageDirectory, "package.json");
  if (!existsSync(exportManifestPath)) {
    throw new Error(`Missing built package manifest: ${path.relative(root, exportManifestPath)}`);
  }
  const exportManifest = JSON.parse(await readFile(exportManifestPath, "utf8"));
  packageMetadata.set(sourceManifest.name, {
    name: sourceManifest.name,
    version: sourceManifest.version,
    description: sourceManifest.description,
  });

  const exportRoot = path.dirname(exportManifestPath);
  for (const [subpath, target] of Object.entries(exportManifest.exports ?? {})) {
    if (
      subpath === "./package.json" ||
      subpath.startsWith("./internal/") ||
      subpath.includes("*")
    ) {
      continue;
    }
    const typesTarget = typeof target === "string" ? target : target?.types;
    if (typeof typesTarget !== "string") continue;
    const declarationPath = path.resolve(exportRoot, typesTarget);
    if (!existsSync(declarationPath)) {
      throw new Error(
        `Missing declaration for ${sourceManifest.name}${subpath === "." ? "" : subpath.slice(1)}: ` +
          path.relative(root, declarationPath),
      );
    }
    entryPoints.push({
      packageName: sourceManifest.name,
      name: subpath === "." ? sourceManifest.name : `${sourceManifest.name}${subpath.slice(1)}`,
      declarationPath,
    });
  }
}

const program = ts.createProgram([...new Set(entryPoints.map((entry) => entry.declarationPath))], {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  types: [],
});
const checker = program.getTypeChecker();
const entriesByPackage = new Map();

for (const entryPoint of entryPoints.sort((left, right) => left.name.localeCompare(right.name))) {
  const sourceFile = program.getSourceFile(entryPoint.declarationPath);
  if (!sourceFile) throw new Error(`TypeScript did not load ${entryPoint.declarationPath}`);
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) throw new Error(`No module symbol for ${entryPoint.name}`);
  const exports = checker
    .getExportsOfModule(moduleSymbol)
    .filter((symbol) => !symbol.name.startsWith("__"))
    .map((symbol) => serializeExport(symbol))
    .sort((left, right) => left.name.localeCompare(right.name));
  const packageEntries = entriesByPackage.get(entryPoint.packageName) ?? [];
  packageEntries.push({ name: entryPoint.name, exports });
  entriesByPackage.set(entryPoint.packageName, packageEntries);
}

const packages = [...packageMetadata.values()]
  .map((metadata) => ({
    ...metadata,
    entryPoints: entriesByPackage.get(metadata.name) ?? [],
  }))
  .sort((left, right) => left.name.localeCompare(right.name));
const payload = {
  schemaVersion: 1,
  sourceHash: sha256(JSON.stringify(packages)),
  packages,
};
const rendered = `${JSON.stringify(payload, null, 2)}\n`;

if (command === "generate") {
  await writeFile(outputPath, rendered);
  printSummary("Generated", payload);
} else {
  const existing = existsSync(outputPath) ? await readFile(outputPath, "utf8") : "";
  if (existing !== rendered) {
    throw new Error(
      "The MCP API catalog is stale. Run `pnpm run mcp:catalog` after building the packages.",
    );
  }
  printSummary("Checked", payload);
}

function serializeExport(symbol) {
  const target =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = chooseDeclaration(target.declarations ?? symbol.declarations ?? []);
  const kind = declaration ? declarationKind(declaration) : "unknown";
  const throws = tagDocumentation(target, "throws", "exception");
  const members =
    declaration && (ts.isInterfaceDeclaration(declaration) || ts.isClassDeclaration(declaration))
      ? checker
          .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(target))
          .filter(isPublicSymbol)
          .map(serializeMember)
          .sort((left, right) => left.name.localeCompare(right.name))
      : [];
  return {
    name: symbol.name,
    kind,
    description: documentation(target) || derivedDescription(symbol.name, kind),
    ...(throws.length > 0 ? { throws } : {}),
    signature: declaration ? declarationSignature(target, declaration) : symbol.name,
    members,
  };
}

function serializeMember(symbol) {
  const declaration = chooseDeclaration(symbol.declarations ?? []);
  const kind = declaration ? declarationKind(declaration) : "member";
  const throws = tagDocumentation(symbol, "throws", "exception");
  return {
    name: symbol.name,
    kind,
    optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
    description: documentation(symbol) || derivedDescription(symbol.name, kind),
    ...(throws.length > 0 ? { throws } : {}),
    signature: declaration ? declarationSignature(symbol, declaration) : symbol.name,
  };
}

function isPublicSymbol(symbol) {
  const declarations = symbol.declarations ?? [];
  if (declarations.length === 0) return true;
  return declarations.some((declaration) => {
    const modifiers = ts.canHaveModifiers(declaration) ? (ts.getModifiers(declaration) ?? []) : [];
    return !modifiers.some(
      (modifier) =>
        modifier.kind === ts.SyntaxKind.PrivateKeyword ||
        modifier.kind === ts.SyntaxKind.ProtectedKeyword,
    );
  });
}

function chooseDeclaration(declarations) {
  return declarations[0] ?? null;
}

function declarationKind(declaration) {
  if (ts.isClassDeclaration(declaration)) return "class";
  if (ts.isInterfaceDeclaration(declaration)) return "interface";
  if (ts.isTypeAliasDeclaration(declaration)) return "type";
  if (
    ts.isFunctionDeclaration(declaration) ||
    ts.isMethodDeclaration(declaration) ||
    ts.isMethodSignature(declaration)
  ) {
    return "function";
  }
  if (ts.isEnumDeclaration(declaration)) return "enum";
  if (ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration)) {
    return "property";
  }
  if (ts.isVariableDeclaration(declaration)) return "constant";
  return ts.SyntaxKind[declaration.kind] ?? "unknown";
}

function declarationSignature(symbol, declaration) {
  if (ts.isInterfaceDeclaration(declaration) || ts.isClassDeclaration(declaration)) {
    return declaration
      .getText(declaration.getSourceFile())
      .split("{")[0]
      .trim()
      .replace(/^export\s+(?:declare\s+)?/u, "");
  }
  if (ts.isTypeAliasDeclaration(declaration)) {
    const parameters = declaration.typeParameters?.length
      ? `<${declaration.typeParameters.map((parameter) => parameter.getText()).join(", ")}>`
      : "";
    return `type ${symbol.name}${parameters} = ${declaration.type.getText(declaration.getSourceFile())}`;
  }
  // A property's written annotation already names the type the author chose.
  // Resolving it instead expands generics structurally, which turns a reference
  // like DeepPartial<StockAppearanceOptions> into thousands of characters and
  // hides the very name a reader needs to look up.
  if (
    (ts.isPropertySignature(declaration) ||
      ts.isPropertyDeclaration(declaration) ||
      ts.isVariableDeclaration(declaration)) &&
    declaration.type
  ) {
    const written = declaration.type
      .getText(declaration.getSourceFile())
      .replace(/\s+/gu, " ")
      .trim();
    return `${symbol.name}: ${written}`;
  }
  const location = declaration.name ?? declaration;
  const type = checker.getTypeOfSymbolAtLocation(symbol, location);
  const rendered = checker.typeToString(
    type,
    location,
    ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
      ts.TypeFormatFlags.WriteArrowStyleSignature,
  );
  return `${symbol.name}: ${rendered}`;
}

function documentation(symbol) {
  return ts
    .displayPartsToString(symbol.getDocumentationComment(checker))
    .replace(/\s+/gu, " ")
    .trim();
}

function tagDocumentation(symbol, ...names) {
  const accepted = new Set(names);
  return symbol
    .getJsDocTags(checker)
    .filter((tag) => accepted.has(tag.name))
    .map((tag) => normalizeTagText(tag.text))
    .filter(Boolean);
}

function normalizeTagText(value) {
  const text =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.map((part) => part.text ?? "").join("")
        : "";
  return text.replace(/\s+/gu, " ").trim();
}

function derivedDescription(name, kind) {
  const words = String(name)
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .toLocaleLowerCase("en-US");
  if (kind === "function") return `The ${words} operation.`;
  if (kind === "class") return `The public ${words} API.`;
  if (kind === "interface") return `Configuration and data for ${words}.`;
  if (kind === "type") return `Accepted values for ${words}.`;
  return `The ${words} value.`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function printSummary(verb, catalog) {
  const entryPointCount = catalog.packages.reduce(
    (sum, packageEntry) => sum + packageEntry.entryPoints.length,
    0,
  );
  const exportCount = catalog.packages.reduce(
    (sum, packageEntry) =>
      sum +
      packageEntry.entryPoints.reduce(
        (entrySum, entryPoint) => entrySum + entryPoint.exports.length,
        0,
      ),
    0,
  );
  console.log(
    `${verb} MCP catalog ${catalog.sourceHash.slice(0, 12)} ` +
      `(${catalog.packages.length} packages, ${entryPointCount} entry points, ${exportCount} exports).`,
  );
}
