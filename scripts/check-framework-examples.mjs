#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const requested = process.argv.slice(2);
const examples = requested.length ? requested : ["react", "vue", "angular", "svelte", "solid"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function serve(directory) {
  const absoluteRoot = path.resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const absolute = path.resolve(absoluteRoot, relative);
      assert(
        absolute === absoluteRoot || absolute.startsWith(`${absoluteRoot}${path.sep}`),
        "Path escaped example root",
      );
      const info = await stat(absolute);
      const file = info.isDirectory() ? path.join(absolute, "index.html") : absolute;
      const body = await readFile(file);
      const type = file.endsWith(".html")
        ? "text/html"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".js")
            ? "text/javascript"
            : "application/octet-stream";
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Example server has no port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

const browser = await chromium.launch({ headless: true });
try {
  for (const name of examples) {
    const dist = path.join(
      root,
      "examples",
      name,
      "dist",
      ...(name === "angular" ? ["browser"] : []),
    );
    const server = await serve(dist);
    const page = await browser.newPage();
    const errors = [];
    const external = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).origin !== server.origin) external.push(request.url());
    });
    try {
      await page.goto(server.origin, { waitUntil: "networkidle" });
      try {
        await page.waitForFunction(
          () => document.documentElement.dataset.sixtyfoldReady === "2",
          null,
          { timeout: 20_000 },
        );
      } catch (error) {
        const state = await page.evaluate(() => ({
          ready: document.documentElement.dataset.sixtyfoldReady ?? "0",
          canvases: document.querySelectorAll("canvas").length,
          lineHosts: document.querySelectorAll("sixtyfold-line-chart").length,
          stockHosts: document.querySelectorAll("sixtyfold-stock-chart").length,
        }));
        throw new Error(
          `${name}: readiness stopped at ${state.ready}; DOM ${JSON.stringify(state)}; browser errors\n${errors.join("\n")}`,
          { cause: error },
        );
      }
      assert((await page.locator("canvas").count()) === 2, `${name}: expected two chart canvases`);
      const workloads = await page
        .locator("[data-workload]")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-workload")),
        );
      assert(
        workloads.includes("5000000") && workloads.includes("6000000"),
        `${name}: expected the 5M line and 6M stock workloads, received ${workloads.join(", ")}`,
      );
      assert(errors.length === 0, `${name}: browser errors\n${errors.join("\n")}`);
      assert(external.length === 0, `${name}: external requests\n${external.join("\n")}`);
      console.log(`${name}: 5M line and 6M stock workloads ready`);
    } finally {
      await page.close();
      await server.close();
    }
  }
} finally {
  await browser.close();
}
