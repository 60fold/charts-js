import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { z } from "zod/v4";
import { getApiCatalog, searchApiCatalog, summarizeApiCatalog } from "./catalog.js";
import {
  COMPONENTS,
  DATA_SHAPE_FORMATS,
  DATA_TIME_UNITS,
  diagnoseChart,
  FRAMEWORKS,
  generateIntegrationForVersion,
  LICENSING_GUIDE,
  OWNERSHIP_GUIDE,
  PERFORMANCE_GUIDE,
  RENDER_MODES,
  recommendPackagesForVersion,
  recommendPerformanceSettings,
  validateChartOptions,
} from "./guidance.js";

const componentSchema = z.enum(COMPONENTS);
const frameworkSchema = z.enum(FRAMEWORKS);
const renderModeSchema = z.enum(RENDER_MODES);
const sourceFieldSchema = z.string().trim().min(1).max(80);
const dataShapeSchema = z.object({
  format: z.enum(DATA_SHAPE_FORMATS).optional(),
  timeField: sourceFieldSchema.optional(),
  timeUnit: z.enum(DATA_TIME_UNITS).optional(),
  valueFields: z.array(sourceFieldSchema).min(1).max(16).optional(),
  openField: sourceFieldSchema.optional(),
  highField: sourceFieldSchema.optional(),
  lowField: sourceFieldSchema.optional(),
  closeField: sourceFieldSchema.optional(),
  volumeField: sourceFieldSchema.optional(),
  estimatedRows: z.number().int().min(0).optional(),
});
const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version?: unknown };
const serverVersion =
  typeof packageManifest.version === "string" ? packageManifest.version : "0.0.0";
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

const SERVER_INSTRUCTIONS = `Sixtyfold renders Canvas2D line and stock/OHLCV charts for datasets in the millions of points.
Use this server whenever you add, debug, tune, or review a Sixtyfold chart, so that package
selection, API usage, and performance settings match the exact installed version instead of
recalled defaults.

Suggested order:
1. recommend_packages — the smallest correct package set for the chart, framework, and SSR needs.
2. generate_integration — a lifecycle-safe scaffold, including adapting your data into typed arrays.
3. inspect_component_api — confirm any symbol before using it.
4. recommend_performance_settings — pick renderMode and LOD from the real workload shape.
5. validate_chart_options and diagnose_chart — preflight options, and map a symptom to focused checks.

Three mistakes cause most broken integrations:
- Bulk typed arrays become renderer-owned after installation. Worker mode transfers and detaches
  their buffers; main-thread mode retains references. Clone before setData only when another
  subsystem must keep a readable copy.
- The canvas host needs a concrete height before initialize() runs, or the chart renders blank.
- Charts must be destroyed on unmount, and must not initialize during server-side rendering.

Answers describe the installed version only; do not generalize them to other releases. Long
structural signatures are truncated with a marker — read sixtyfold://api/{package} for the full
type.`;

/** Create the local, read-only Sixtyfold MCP server without connecting a transport. */
export function createSixtyfoldMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "sixtyfold-components",
      version: serverVersion,
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "list_packages",
    {
      title: "List Sixtyfold packages",
      description:
        "List the independently installable Sixtyfold packages, their installed versions and public entry points. " +
        "Use it to orient before a more specific lookup, or to report exactly which versions are in play.",
      annotations: readOnlyAnnotations,
    },
    async () => textResult(summarizeApiCatalog()),
  );

  server.registerTool(
    "inspect_component_api",
    {
      title: "Inspect Sixtyfold API",
      description:
        "Look up the exact versioned TypeScript API before using any Sixtyfold symbol you are not certain about. " +
        "Returns only matching symbols and their matching members, including documented failure contracts, " +
        "never the whole inventory. " +
        "Prefer a specific symbol name over a broad word. Long structural signatures are truncated with a marker; " +
        "read the sixtyfold://api/{package} resource when you need a complete type.",
      inputSchema: {
        query: z.string().min(1).max(160),
        packageName: z.string().min(1).max(64).optional(),
        limit: z.number().int().min(1).max(20).optional(),
        maxMembers: z.number().int().min(0).max(50).optional(),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ query, packageName, limit, maxMembers }) =>
      textResult(searchApiCatalog(query, { packageName, limit, maxMembers })),
  );

  server.registerTool(
    "recommend_packages",
    {
      title: "Recommend Sixtyfold packages",
      description:
        "Call this first when adding a Sixtyfold chart to a project. Returns the smallest npm package set " +
        "for the chart type, framework, themes and optional Node.js SSR, so nothing unnecessary is installed.",
      inputSchema: {
        component: componentSchema,
        framework: frameworkSchema.optional(),
        themes: z.boolean().optional(),
        ssr: z.boolean().optional(),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => textResult(recommendPackagesForVersion(input, serverVersion)),
  );

  server.registerTool(
    "generate_integration",
    {
      title: "Generate a Sixtyfold integration",
      description:
        "Call this before writing chart setup code by hand. Generates a deterministic, lifecycle-safe vanilla, " +
        "React, Vue, Angular, Svelte or SolidJS recipe with correct initialization, cleanup and worker fallback. " +
        "Describe your existing data in dataShape and it also emits the adapter that converts it into " +
        "chart-owned typed arrays, which is where most hand-written integrations go wrong.",
      inputSchema: {
        component: componentSchema,
        framework: frameworkSchema.optional(),
        renderMode: renderModeSchema.optional(),
        themes: z.boolean().optional(),
        ssr: z.boolean().optional(),
        dataShape: dataShapeSchema.optional(),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => textResult(generateIntegrationForVersion(input, serverVersion)),
  );

  server.registerTool(
    "validate_chart_options",
    {
      title: "Validate Sixtyfold options",
      description:
        "Check a constructed options object before running it, to catch unknown keys and wrong value types " +
        "at author time rather than as a blank or misdrawn chart. TypeScript declarations remain authoritative.",
      inputSchema: {
        component: componentSchema,
        options: z.record(z.string(), z.unknown()),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ component, options }) => textResult(validateChartOptions(component, options)),
  );

  server.registerTool(
    "recommend_performance_settings",
    {
      title: "Recommend Sixtyfold performance settings",
      description:
        "Call this whenever the dataset exceeds roughly 100k points, streams live, or renders slowly. " +
        "Returns a grounded starting point for render mode, LOD and data transfer based on the workload shape. " +
        "Recommendations are starting points to measure, not device-independent frame-rate guarantees.",
      inputSchema: {
        component: componentSchema,
        points: z.number().int().min(0),
        series: z.number().int().min(1).optional(),
        rangeSeries: z.number().int().min(0).optional(),
        streaming: z.boolean().optional(),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => textResult(recommendPerformanceSettings(input)),
  );

  server.registerTool(
    "diagnose_chart",
    {
      title: "Diagnose a Sixtyfold chart",
      description:
        "Call this first when a chart is blank, misdrawn, leaking, throwing on detached buffers, or slow. " +
        "Describe the observed symptom in plain words and it maps it to focused public-API checks and fixes, " +
        "instead of guessing at the cause.",
      inputSchema: {
        component: componentSchema,
        symptom: z.string().min(3).max(1000),
      },
      annotations: readOnlyAnnotations,
    },
    async (input) => textResult(diagnoseChart(input)),
  );

  server.registerResource(
    "package-catalog",
    "sixtyfold://catalog/packages",
    {
      title: "Sixtyfold package catalog",
      description: "Installed package versions and public entry points.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(summarizeApiCatalog(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "licensing-guide",
    "sixtyfold://guides/licensing",
    {
      title: "Sixtyfold licensing guide",
      description: "Minimal licensing guardrails with authoritative website links.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: LICENSING_GUIDE }],
    }),
  );

  server.registerResource(
    "performance-guide",
    "sixtyfold://guides/performance",
    {
      title: "Sixtyfold performance baseline",
      description: "Worker, typed-array, LOD and measurement guidance.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: PERFORMANCE_GUIDE }],
    }),
  );

  server.registerResource(
    "data-ownership-guide",
    "sixtyfold://guides/data-ownership",
    {
      title: "Sixtyfold typed-array ownership",
      description: "Transfer and buffer-detachment rules for chart data.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: OWNERSHIP_GUIDE }],
    }),
  );

  server.registerResource(
    "package-api",
    new ResourceTemplate("sixtyfold://api/{packageName}", { list: undefined }),
    {
      title: "Sixtyfold package API",
      description: "The complete versioned API inventory for one Sixtyfold package.",
      mimeType: "application/json",
    },
    async (uri, { packageName }) => {
      const normalized = String(packageName).startsWith("@sixtyfold/")
        ? String(packageName)
        : `@sixtyfold/${String(packageName)}`;
      const packageEntry = getApiCatalog().packages.find((entry) => entry.name === normalized);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              packageEntry ?? { error: `Unknown Sixtyfold package: ${normalized}` },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "add-sixtyfold-chart",
    {
      title: "Add a Sixtyfold chart",
      description:
        "Plan a version-correct Sixtyfold chart integration before editing the application.",
      argsSchema: {
        component: componentSchema,
        framework: frameworkSchema,
        requirements: z.string().max(2000).optional(),
      },
    },
    ({ component, framework, requirements }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Add a Sixtyfold ${component} chart to this ${framework} project. ` +
              "First call recommend_packages and generate_integration, then inspect any uncertain API symbol. " +
              "Preserve typed-array transfer ownership, cleanup and SSR boundaries. " +
              (requirements ? `Additional requirements: ${requirements}` : ""),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "tune-sixtyfold-performance",
    {
      title: "Tune Sixtyfold performance",
      description:
        "Review a representative Sixtyfold workload without promising device-independent frame rates.",
      argsSchema: {
        component: componentSchema,
        workload: z.string().min(3).max(2000),
      },
    },
    ({ component, workload }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Tune this Sixtyfold ${component} workload: ${workload}\n` +
              "Use recommend_performance_settings and inspect_component_api. " +
              "Separate measured facts from recommendations and retain the documented FPS caveat.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "review-sixtyfold-integration",
    {
      title: "Review a Sixtyfold integration",
      description: "Review package selection, lifecycle, transfer ownership and public API usage.",
      argsSchema: {
        component: componentSchema,
        code: z.string().min(1).max(20_000),
      },
    },
    ({ component, code }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Review this Sixtyfold ${component} integration. Validate uncertain options with the MCP tools. ` +
              "Check initialization, cleanup, worker fallback, typed-array ownership, SSR behavior and imports.\n\n" +
              code,
          },
        },
      ],
    }),
  );

  return server;
}
