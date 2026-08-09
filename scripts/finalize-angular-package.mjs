#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPackageDirectory,
  optionalOption,
  packageNameForDirectory,
} from "./release-utils.mjs";

export async function finalizeAngularPackage(root) {
  const outputPath = path.join(root, "packages/angular/dist/package.json");
  const output = JSON.parse(await readFile(outputPath, "utf8"));
  const workspaceVersions = new Map();

  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, range] of Object.entries(output[field] ?? {})) {
      if (name.startsWith("@sixtyfold/") && String(range).startsWith("workspace:")) {
        const directory = assertPackageDirectory(name.slice("@sixtyfold/".length));
        if (packageNameForDirectory(directory) !== name) {
          throw new Error(`Unexpected Sixtyfold dependency: ${name}`);
        }
        if (!workspaceVersions.has(name)) {
          const dependencyManifest = JSON.parse(
            await readFile(path.join(root, "packages", directory, "package.json"), "utf8"),
          );
          if (dependencyManifest.name !== name) {
            throw new Error(`${name}: workspace package identity is inconsistent`);
          }
          workspaceVersions.set(name, dependencyManifest.version);
        }
        output[field][name] = `^${workspaceVersions.get(name)}`;
      }
    }
  }

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
}

async function main() {
  const root = path.resolve(optionalOption("--root") ?? path.join(import.meta.dirname, ".."));
  await finalizeAngularPackage(root);
}

const invokedFile = process.argv[1] ? realpathSync(process.argv[1]) : "";
const moduleFile = realpathSync(fileURLToPath(import.meta.url));
if (invokedFile === moduleFile) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
