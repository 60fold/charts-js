import { readdir, rm, stat } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";

const packageRoot = process.cwd();
const distRoot = resolve(packageRoot, "dist");
const targets = process.argv.slice(2);

if (targets.length === 0) {
  throw new Error("Provide at least one private declaration directory under dist/.");
}

for (const target of targets) {
  const absoluteTarget = resolve(packageRoot, target);
  const relativeTarget = relative(distRoot, absoluteTarget);
  if (relativeTarget === "" || relativeTarget === ".." || relativeTarget.startsWith(`..${sep}`)) {
    throw new Error(`Refusing to prune outside dist/: ${target}`);
  }

  let targetStat;
  try {
    targetStat = await stat(absoluteTarget);
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  if (!targetStat.isDirectory()) {
    throw new Error(`Private declaration target is not a directory: ${target}`);
  }

  const entries = await readdir(absoluteTarget, {
    recursive: true,
    withFileTypes: true,
  });
  const unexpected = entries.filter(
    (entry) => entry.isFile() && !entry.name.endsWith(".d.ts") && !entry.name.endsWith(".d.ts.map"),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Refusing to remove non-declaration artifacts from ${target}: ${unexpected
        .map((entry) => entry.name)
        .join(", ")}`,
    );
  }

  await rm(absoluteTarget, { recursive: true });
  console.log(`Pruned private declarations from ${relative(packageRoot, absoluteTarget)}.`);
}
