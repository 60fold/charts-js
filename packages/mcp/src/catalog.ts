import { readFileSync } from "node:fs";

export interface ApiMember {
  readonly name: string;
  readonly kind: string;
  readonly optional: boolean;
  readonly description: string;
  /** Documented errors this member can throw. */
  readonly throws?: readonly string[];
  readonly signature: string;
}

export interface ApiExport {
  readonly name: string;
  readonly kind: string;
  readonly description: string;
  /** Documented errors this export can throw. */
  readonly throws?: readonly string[];
  readonly signature: string;
  readonly members: readonly ApiMember[];
}

export interface ApiEntryPoint {
  readonly name: string;
  readonly exports: readonly ApiExport[];
}

export interface ApiPackage {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly entryPoints: readonly ApiEntryPoint[];
}

export interface ApiCatalog {
  readonly schemaVersion: number;
  readonly sourceHash: string;
  readonly packages: readonly ApiPackage[];
}

export interface ApiSearchMember extends ApiMember {
  readonly signatureTruncated?: boolean;
}

export interface ApiSearchResult {
  readonly package: string;
  readonly entryPoint: string;
  readonly name: string;
  readonly kind: string;
  readonly description: string;
  readonly throws?: readonly string[];
  readonly signature: string;
  readonly signatureTruncated?: boolean;
  readonly members: readonly ApiSearchMember[];
  readonly memberCount: number;
  readonly membersOmitted: number;
  readonly membersResource?: string;
  readonly score: number;
}

const CATALOG_URL = new URL("../knowledge/api-reference.json", import.meta.url);
const DEFAULT_MEMBER_LIMIT = 12;
const DEFAULT_MEMBER_BUDGET = 40;
const MAX_SIGNATURE_CHARS = 400;
let cachedCatalog: ApiCatalog | undefined;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

/** Return the immutable, release-versioned public API catalog shipped with the server. */
export function getApiCatalog(): ApiCatalog {
  if (cachedCatalog) return cachedCatalog;
  const parsed = JSON.parse(readFileSync(CATALOG_URL, "utf8")) as ApiCatalog;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.packages)) {
    throw new Error("The packaged Sixtyfold API catalog has an unsupported schema");
  }
  cachedCatalog = deepFreeze(parsed);
  return cachedCatalog;
}

function tokens(value: string): string[] {
  return value
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9@/.-]+/u)
    .filter((token) => token.length > 1);
}

function normalizePackageFilter(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith("@sixtyfold/") ? value : `@sixtyfold/${value}`;
}

/**
 * Structural types in the catalog are fully inlined, so a single property can
 * carry thousands of characters. Cap it and let the agent read the named type
 * through the package API resource instead.
 */
function compactSignature(signature: string): { signature: string; truncated: boolean } {
  if (signature.length <= MAX_SIGNATURE_CHARS) return { signature, truncated: false };
  return {
    signature: `${signature.slice(0, MAX_SIGNATURE_CHARS).trimEnd()} /* … */`,
    truncated: true,
  };
}

function compactMember(member: ApiMember): ApiSearchMember {
  const { signature, truncated } = compactSignature(member.signature);
  return truncated ? { ...member, signature, signatureTruncated: true } : member;
}

function scoreMember(member: ApiMember, queryTokens: readonly string[]): number {
  const name = member.name.toLocaleLowerCase("en-US");
  const signature = member.signature.toLocaleLowerCase("en-US");
  const description = member.description.toLocaleLowerCase("en-US");
  const throws = (member.throws?.join(" ") ?? "").toLocaleLowerCase("en-US");
  let score = 0;
  for (const token of queryTokens) {
    if (name === token) score += 12;
    else if (name.includes(token)) score += 6;
    if (signature.includes(token)) score += 2;
    if (description.includes(token)) score += 1;
    if (throws.includes(token)) score += 1;
  }
  return score;
}

/**
 * Select the members worth returning for one export. Members matching the query
 * win. An export matched by its own name falls back to a bounded preview, and an
 * export matched only incidentally returns none, so a type with hundreds of
 * members never floods an agent context window.
 */
function selectMembers(
  members: readonly ApiMember[],
  queryTokens: readonly string[],
  maxMembers: number,
  symbolMatched: boolean,
): readonly ApiMember[] {
  if (members.length === 0) return [];
  const scored = members
    .map((member) => ({ member, score: scoreMember(member, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  if (scored.length > 0) {
    return scored.slice(0, maxMembers).map((entry) => entry.member);
  }
  return symbolMatched ? members.slice(0, maxMembers) : [];
}

/**
 * Search the packaged TypeScript API without loading the complete catalog into
 * an agent prompt. Exact symbol and entry-point matches receive the most weight.
 */
export function searchApiCatalog(
  query: string,
  options: {
    packageName?: string;
    limit?: number;
    maxMembers?: number;
    memberBudget?: number;
  } = {},
): readonly ApiSearchResult[] {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return [];
  const packageFilter = normalizePackageFilter(options.packageName);
  const limit = Math.min(20, Math.max(1, Math.trunc(options.limit ?? 8)));
  const maxMembers = Math.min(
    50,
    Math.max(0, Math.trunc(options.maxMembers ?? DEFAULT_MEMBER_LIMIT)),
  );
  const memberBudget = Math.min(
    200,
    Math.max(0, Math.trunc(options.memberBudget ?? DEFAULT_MEMBER_BUDGET)),
  );
  const results: {
    package: string;
    entryPoint: string;
    exported: ApiExport;
    candidates: readonly ApiMember[];
    score: number;
  }[] = [];

  for (const packageEntry of getApiCatalog().packages) {
    if (packageFilter && packageEntry.name !== packageFilter) continue;
    for (const entryPoint of packageEntry.entryPoints) {
      for (const exported of entryPoint.exports) {
        const symbol = exported.name.toLocaleLowerCase("en-US");
        const entry = entryPoint.name.toLocaleLowerCase("en-US");
        const memberText = exported.members
          .map(
            (member) =>
              `${member.name} ${member.description} ${member.throws?.join(" ") ?? ""} ${member.signature}`,
          )
          .join(" ")
          .toLocaleLowerCase("en-US");
        const document =
          `${packageEntry.name} ${entryPoint.name} ${exported.name} ${exported.kind} ` +
          `${exported.description} ${exported.throws?.join(" ") ?? ""} ` +
          `${exported.signature} ${memberText}`.toLocaleLowerCase("en-US");
        let score = 0;
        let symbolMatched = false;
        for (const token of queryTokens) {
          if (symbol === token) {
            score += 18;
            symbolMatched = true;
          } else if (symbol.includes(token)) {
            score += 9;
            symbolMatched = true;
          }
          if (entry === token || entry.endsWith(`/${token}`)) score += 8;
          if (memberText.includes(token)) score += 4;
          if (document.includes(token)) score += 1;
        }
        if (score === 0) continue;
        results.push({
          package: packageEntry.name,
          entryPoint: entryPoint.name,
          exported,
          candidates: selectMembers(exported.members, queryTokens, maxMembers, symbolMatched),
          score,
        });
      }
    }
  }

  const ranked = results
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.package.localeCompare(right.package) ||
        left.exported.name.localeCompare(right.exported.name),
    )
    .slice(0, limit);

  let remaining = memberBudget;
  return ranked.map((entry) => {
    const granted = entry.candidates.slice(0, Math.max(0, remaining));
    remaining -= granted.length;
    const omitted = entry.exported.members.length - granted.length;
    const exportSignature = compactSignature(entry.exported.signature);
    return {
      package: entry.package,
      entryPoint: entry.entryPoint,
      name: entry.exported.name,
      kind: entry.exported.kind,
      description: entry.exported.description,
      ...(entry.exported.throws?.length ? { throws: entry.exported.throws } : {}),
      signature: exportSignature.signature,
      ...(exportSignature.truncated ? { signatureTruncated: true } : {}),
      members: granted.map(compactMember),
      memberCount: entry.exported.members.length,
      membersOmitted: omitted,
      ...(omitted > 0
        ? { membersResource: `sixtyfold://api/${entry.package.replace("@sixtyfold/", "")}` }
        : {}),
      score: entry.score,
    };
  });
}

/** Return package metadata and entry-point names without the full symbol inventory. */
export function summarizeApiCatalog(): readonly {
  name: string;
  version: string;
  description: string;
  entryPoints: readonly string[];
}[] {
  return getApiCatalog().packages.map((packageEntry) => ({
    name: packageEntry.name,
    version: packageEntry.version,
    description: packageEntry.description,
    entryPoints: packageEntry.entryPoints.map((entryPoint) => entryPoint.name),
  }));
}
