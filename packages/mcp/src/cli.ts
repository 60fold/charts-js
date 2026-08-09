#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSixtyfoldMcpServer } from "./server.js";

const server = createSixtyfoldMcpServer();
const transport = new StdioServerTransport();

async function close(): Promise<void> {
  await server.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void close().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  });
}

server.connect(transport).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
