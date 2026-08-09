#!/usr/bin/env node

import { readFile, rm } from "node:fs/promises";
import path from "node:path";

const packageRoot = process.cwd();
const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));

if (typeof manifest.name !== "string" || !manifest.name.startsWith("@sixtyfold/")) {
  throw new Error("Refusing to clean dist outside a Sixtyfold package.");
}

await rm(path.join(packageRoot, "dist"), { recursive: true, force: true });
