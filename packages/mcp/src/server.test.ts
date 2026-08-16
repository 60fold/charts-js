// @vitest-environment node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createSixtyfoldMcpServer } from "./server.js";

interface CapabilityManifest {
  tools: string[];
  resources: Array<{ name: string; uri: string }>;
  resourceTemplates: Array<{ name: string; uriTemplate: string }>;
  prompts: string[];
}

const capabilityManifest = JSON.parse(
  readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"),
) as CapabilityManifest;

function textContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const item = content.find(
    (candidate): candidate is { type: "text"; text: string } =>
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as { type?: unknown }).type === "text" &&
      typeof (candidate as { text?: unknown }).text === "string",
  );
  return item?.text ?? "";
}

async function connectedClient() {
  const server = createSixtyfoldMcpServer();
  const client = new Client({
    name: "sixtyfold-mcp-test",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeCallbacks.push(
    () => client.close(),
    () => server.close(),
  );
  return client;
}

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

describe("@sixtyfold/mcp protocol", () => {
  it("exposes exactly the declared capability manifest", async () => {
    // capabilities.json ships with the package and is the single source of
    // truth that documentation checks build on. Any rename, addition, or
    // removal must fail here first, then in the website docs check.
    const client = await connectedClient();

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(capabilityManifest.tools);

    const resources = await client.listResources();
    expect(
      resources.resources
        .map((resource) => ({ name: resource.name, uri: resource.uri }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual(capabilityManifest.resources);

    const templates = await client.listResourceTemplates();
    expect(
      templates.resourceTemplates
        .map((template) => ({
          name: template.name,
          uriTemplate: template.uriTemplate,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual(capabilityManifest.resourceTemplates);

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual(capabilityManifest.prompts);
  });

  it("lists and invokes the read-only tool surface", async () => {
    const server = createSixtyfoldMcpServer();
    const client = new Client({
      name: "sixtyfold-mcp-test",
      version: "1.0.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeCallbacks.push(
      () => client.close(),
      () => server.close(),
    );

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "inspect_component_api",
        "generate_integration",
        "validate_chart_options",
        "recommend_performance_settings",
      ]),
    );
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);

    const result = await client.callTool({
      name: "recommend_packages",
      arguments: {
        component: "line",
        framework: "react",
      },
    });
    expect(textContent(result.content)).toContain("@sixtyfold/react");

    const scaffold = await client.callTool({
      name: "generate_integration",
      arguments: {
        component: "line",
        framework: "react",
        dataShape: {
          format: "object-rows",
          timeField: "observedAt",
          timeUnit: "iso-string",
          valueFields: ["reading"],
          estimatedRows: 1_000_000,
        },
      },
    });
    expect(textContent(scaffold.content)).toContain('row[\\"observedAt\\"]');

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toContain(
      "sixtyfold://guides/performance",
    );

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toContain("add-sixtyfold-chart");
  });

  it("serves minimal licensing guardrails and delegates current terms to the website", async () => {
    const client = await connectedClient();
    const result = await client.readResource({ uri: "sixtyfold://guides/licensing" });
    const text = result.contents
      .map((content) => ("text" in content ? content.text : ""))
      .join("\n");

    expect(result.contents).toEqual([
      expect.objectContaining({
        uri: "sixtyfold://guides/licensing",
        mimeType: "text/markdown",
      }),
    ]);
    expect(text).toContain("PolyForm Noncommercial License 1.0.0");
    expect(text).toContain("not OSI-approved open source");
    expect(text).toContain("non-production commercial development and testing");
    expect(text).toContain("before Production Use or Commercial Redistribution");
    expect(text).toContain("no account, activation key, or runtime phone-home check");
    expect(text).toContain("sixtyfold.dev/en/pricing");
    expect(text).toContain("sixtyfold.dev/en/commercial-terms");
    expect(text).not.toMatch(/https?:\/\//u);
    expect(text).not.toContain("sixtyfold.dev/en/licensing");
    expect(text).not.toContain("sixtyfold.dev/en/commercial-evaluation-terms");
    expect(text).not.toMatch(/\b(?:v1|24 months|50 employees|10 products)\b/iu);
    expect(text).not.toMatch(
      /money-back|standard support|critical security|current offer|Stripe\/Link/iu,
    );
    expect(text).not.toMatch(/[$€£]\s*\d/u);
  });
});
