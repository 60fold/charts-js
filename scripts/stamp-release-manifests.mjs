#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PACKAGE_DIRECTORIES,
  assertPackageDirectory,
  assertReleaseVersion,
  hasFlag,
  optionalOption,
  packageNameForDirectory,
  readJson,
  requiredOption,
} from "./release-utils.mjs";

async function prepareStampedManifest({ root, directory, version }) {
  const file = path.join(root, "packages", directory, "package.json");
  const manifest = await readJson(file);
  if (manifest.name !== packageNameForDirectory(directory)) {
    throw new Error(`${file}: unexpected package name ${manifest.name}`);
  }
  const sourceVersion = version.split("-rc.")[0];
  if (manifest.version !== sourceVersion) {
    throw new Error(
      `${manifest.name} source version is ${manifest.version}; expected ${sourceVersion}`,
    );
  }
  manifest.version = version;
  return { file, manifest };
}

function resolveSuiteWorkspaceDependencies(manifest, version) {
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "devDependencies",
  ]) {
    for (const [name, specifier] of Object.entries(manifest[field] ?? {})) {
      if (!name.startsWith("@sixtyfold/") || typeof specifier !== "string") {
        continue;
      }
      if (specifier === "workspace:^") {
        manifest[field][name] = `^${version}`;
      } else if (specifier === "workspace:~") {
        manifest[field][name] = `~${version}`;
      } else if (specifier === "workspace:*") {
        manifest[field][name] = version;
      } else if (specifier.startsWith("workspace:")) {
        throw new Error(`${manifest.name} has unsupported suite dependency ${name}@${specifier}`);
      }
    }
  }
}

export async function stampReleaseManifests({ root, directory, version }) {
  assertPackageDirectory(directory);
  assertReleaseVersion(version);
  const { file, manifest } = await prepareStampedManifest({
    root,
    directory,
    version,
  });
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function stampReleaseSuiteManifests({ root, version }) {
  assertReleaseVersion(version);
  const prepared = await Promise.all(
    PACKAGE_DIRECTORIES.map((directory) =>
      prepareStampedManifest({
        root,
        directory,
        version,
      }),
    ),
  );
  for (const { manifest } of prepared) {
    resolveSuiteWorkspaceDependencies(manifest, version);
  }
  await Promise.all(
    prepared.map(({ file, manifest }) => writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`)),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const root = path.resolve(optionalOption("--root", argv) ?? process.cwd());
  const directory = optionalOption("--package", argv);
  const all = hasFlag("--all", argv);
  if ((directory ? 1 : 0) + (all ? 1 : 0) !== 1) {
    throw new Error("Provide exactly one of --package <directory> or --all");
  }
  const release = {
    root,
    version: requiredOption("--version", argv),
  };
  if (all) {
    await stampReleaseSuiteManifests(release);
    console.log(`Stamped all ${PACKAGE_DIRECTORIES.length} packages in ${root}`);
  } else {
    await stampReleaseManifests({ ...release, directory });
    console.log(`Stamped @sixtyfold/${directory} in ${root}`);
  }
}

const invokedFile = process.argv[1] ? realpathSync(process.argv[1]) : "";
const moduleFile = realpathSync(fileURLToPath(import.meta.url));
if (invokedFile === moduleFile) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
