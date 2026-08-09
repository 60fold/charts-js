import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

export const PACKAGE_DIRECTORIES = Object.freeze([
  "core",
  "line",
  "stock",
  "ssr",
  "themes",
  "react",
  "vue",
  "angular",
  "svelte",
  "solid",
  "mcp",
]);

export const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/u;
const PACKAGE_DIRECTORY_SET = new Set(PACKAGE_DIRECTORIES);
const DEPENDENCY_FIELDS = Object.freeze([
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies",
]);
const LOCAL_DEPENDENCY_PATTERN =
  /^(?:workspace:|file:|link:|portal:|patch:|\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/])/u;

export function assertReleaseVersion(version) {
  if (!RELEASE_VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
  return version;
}

export function assertPackageDirectory(directory) {
  if (!PACKAGE_DIRECTORY_SET.has(directory)) {
    throw new Error(`Invalid package directory: ${directory}`);
  }
  return directory;
}

export function packageNameForDirectory(directory) {
  return `@sixtyfold/${assertPackageDirectory(directory)}`;
}

export function findLocalDependencySpecifiers(manifest) {
  const local = [];
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, specifier] of Object.entries(manifest[field] ?? {})) {
      if (typeof specifier === "string" && LOCAL_DEPENDENCY_PATTERN.test(specifier)) {
        local.push({ field, name, specifier });
      }
    }
  }
  return local;
}

export function requiredOption(name, argv = process.argv.slice(2)) {
  const index = argv.indexOf(name);
  const value = index === -1 ? undefined : argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required option ${name}`);
  }
  return value;
}

export function optionalOption(name, argv = process.argv.slice(2)) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

export function hasFlag(name, argv = process.argv.slice(2)) {
  return argv.includes(name);
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result;
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
