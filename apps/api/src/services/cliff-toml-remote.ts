/**
 * Strip and inject `[remote.*]` sections from a user-supplied cliff.toml so
 * the API never carries the user's token to disk, never makes outbound
 * requests, and still renders templates that reference `remote.*` data.
 *
 * The scanner is a line-based pass with state for triple-quoted strings —
 * the existing helpers (`extractBumpInitialTag`, `cliffTomlContainsSecret`)
 * are the model. We deliberately avoid pulling in a real TOML parser; the
 * inline-table form is refused outright.
 */

export const REMOTE_KINDS = [
  "github",
  "gitlab",
  "gitea",
  "bitbucket",
  "azure_devops",
] as const;
export type RemoteKind = (typeof REMOTE_KINDS)[number];

export interface CarriedOverFields {
  owner?: string;
  repo?: string;
  api_url?: string;
}

export interface ParseAndStripResult {
  cleanedToml: string;
  detectedKinds: RemoteKind[];
  carriedOver: Partial<Record<RemoteKind, CarriedOverFields>>;
  referencedToken: boolean;
}

export class InlineRemoteTableError extends Error {
  constructor() {
    super(
      "inline-table `remote = { ... }` is not supported in cliff-notes; use the section form `[remote.<kind>]`.",
    );
    this.name = "InlineRemoteTableError";
  }
}

const OWNER_REGEX: Record<RemoteKind, RegExp> = {
  github: /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,38})$/,
  gitea: /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,38})$/,
  bitbucket: /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,38})$/,
  azure_devops: /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?$/,
  gitlab: /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/,
};
const REPO_REGEX = /^[A-Za-z0-9._-]{1,100}$/;

function isRemoteKind(s: string): s is RemoteKind {
  return (REMOTE_KINDS as readonly string[]).includes(s);
}

function validateApiUrl(s: string): string | undefined {
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return s;
  } catch {
    return undefined;
  }
}

function unquote(value: string): string | undefined {
  const t = value.trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' || first === "'") && last === first) {
      return t.slice(1, -1);
    }
  }
  return undefined;
}

interface ScanState {
  inTriple: false | '"""' | "'''";
  inSection: string | null; // current section header path, e.g. "remote.github"
}

/**
 * Quick scan that tracks triple-quoted-string state so that we don't
 * miss-detect section headers appearing inside template bodies.
 *
 * Important caveat: this does *not* implement TOML grammar. It only knows
 * about triple-quoted string boundaries and bare section headers at the
 * start of a line. This is intentional — the codebase has the same scanner
 * style elsewhere.
 */
function updateTripleQuoteState(line: string, state: ScanState): void {
  let i = 0;
  while (i < line.length) {
    if (!state.inTriple) {
      // Look for a triple-quote opener, skipping single-line strings & comments.
      const ch = line[i];
      if (ch === "#") return; // rest of line is a comment
      if (line.startsWith('"""', i)) {
        state.inTriple = '"""';
        i += 3;
        continue;
      }
      if (line.startsWith("'''", i)) {
        state.inTriple = "'''";
        i += 3;
        continue;
      }
      if (ch === '"' || ch === "'") {
        // Single-line string — skip to closing quote (or EOL).
        const quote = ch;
        i++;
        while (i < line.length) {
          if (line[i] === "\\" && i + 1 < line.length) {
            i += 2;
            continue;
          }
          if (line[i] === quote) {
            i++;
            break;
          }
          i++;
        }
        continue;
      }
      i++;
    } else {
      const closer = state.inTriple;
      const idx = line.indexOf(closer, i);
      if (idx < 0) return; // still inside triple
      state.inTriple = false;
      i = idx + 3;
    }
  }
}

/**
 * Detect dotted-key root-level assignments that look like remote config,
 * e.g. `remote.github.owner = "foo"` or `remote.github.token = "..."`.
 * Returns the parsed kind and key name if the line matched and we should
 * strip it.
 */
function matchDottedRemoteAssignment(
  line: string,
): { kind: RemoteKind | null; key: string; value: string } | null {
  const m = /^\s*remote\.([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?\s*=\s*(.*?)\s*$/.exec(
    line.replace(/#.*$/, ""),
  );
  if (!m) return null;
  const first = m[1] ?? "";
  const second = m[2];
  const value = m[3] ?? "";
  if (second) {
    return { kind: isRemoteKind(first) ? first : null, key: second, value };
  }
  // remote.<key> = ... (no kind in the dotted path) — bare remote field
  return { kind: null, key: first, value };
}

/**
 * Detect inline-table assignments at root level: `remote = { ... }` or
 * `remote.github = { ... }`. We refuse to strip these and raise.
 */
function matchInlineRemoteAssignment(line: string): boolean {
  const stripped = line.replace(/#.*$/, "").trim();
  return /^remote(\.[A-Za-z_][A-Za-z0-9_]*)*\s*=\s*\{/.test(stripped);
}

export function parseAndStripRemote(toml: string): ParseAndStripResult {
  const lines = toml.split(/\r?\n/);
  const out: string[] = [];
  const detected = new Set<RemoteKind>();
  const carriedOver: Partial<Record<RemoteKind, CarriedOverFields>> = {};
  let referencedToken = false;

  const state: ScanState = { inTriple: false, inSection: null };
  let stripping = false; // are we currently inside a section that should be dropped?
  let currentStripKind: RemoteKind | null = null;

  for (const raw of lines) {
    // While inside a triple-quoted string, headers and assignments don't
    // start sections — pass the line through verbatim.
    if (state.inTriple) {
      out.push(raw);
      updateTripleQuoteState(raw, state);
      continue;
    }

    // Inline-table form is rejected before anything else: it can hide a token
    // and the scanner won't reliably strip it.
    if (matchInlineRemoteAssignment(raw)) {
      throw new InlineRemoteTableError();
    }

    const codeLine = raw.replace(/#.*$/, "");
    const headerMatch = /^\s*\[\[?([^\]]+)\]\]?\s*$/.exec(codeLine);
    if (headerMatch) {
      const header = (headerMatch[1] ?? "").trim();
      state.inSection = header;
      const parts = header.split(".");
      const base = parts[0] ?? "";
      const sub = parts[1] ?? "";

      if (base === "remote") {
        // [remote], [remote.<kind>], [remote.<kind>.<anything>]
        stripping = true;
        if (sub && isRemoteKind(sub)) {
          currentStripKind = sub;
          detected.add(sub);
          carriedOver[sub] ??= {};
        } else {
          currentStripKind = null;
        }
        // header itself is stripped — don't emit
        continue;
      }
      stripping = false;
      currentStripKind = null;
      out.push(raw);
      updateTripleQuoteState(raw, state);
      continue;
    }

    if (stripping) {
      // Inside a `[remote.*]` block: capture owner/repo/api_url/token, then drop.
      const kv = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(codeLine);
      if (kv) {
        const key = kv[1]!;
        const rawValue = kv[2] ?? "";
        if (key === "token") {
          referencedToken = true;
        }
        if (currentStripKind) {
          const target = carriedOver[currentStripKind]!;
          if (key === "owner") {
            const v = unquote(rawValue);
            if (v && OWNER_REGEX[currentStripKind].test(v)) target.owner = v;
          } else if (key === "repo") {
            const v = unquote(rawValue);
            if (v && REPO_REGEX.test(v)) target.repo = v;
          } else if (key === "api_url") {
            const v = unquote(rawValue);
            const validated = v ? validateApiUrl(v) : undefined;
            if (validated) target.api_url = validated;
          }
        }
      }
      updateTripleQuoteState(raw, state);
      // Drop the line.
      continue;
    }

    // Outside of a `[remote.*]` section. Check for dotted-key root-level
    // assignments that target remote.*.
    const dotted = matchDottedRemoteAssignment(raw);
    if (dotted) {
      if (dotted.kind) {
        detected.add(dotted.kind);
        carriedOver[dotted.kind] ??= {};
        const target = carriedOver[dotted.kind]!;
        const v = unquote(dotted.value);
        if (dotted.key === "token") {
          referencedToken = true;
        } else if (dotted.key === "owner" && v && OWNER_REGEX[dotted.kind].test(v)) {
          target.owner = v;
        } else if (dotted.key === "repo" && v && REPO_REGEX.test(v)) {
          target.repo = v;
        } else if (dotted.key === "api_url" && v) {
          const validated = validateApiUrl(v);
          if (validated) target.api_url = validated;
        }
      } else if (dotted.key === "token") {
        // `remote.token = ...` — bare remote secret. Strip and note.
        referencedToken = true;
      }
      // Either way, drop the line.
      updateTripleQuoteState(raw, state);
      continue;
    }

    out.push(raw);
    updateTripleQuoteState(raw, state);
  }

  const detectedKinds = REMOTE_KINDS.filter((k) => detected.has(k));
  return {
    cleanedToml: out.join("\n"),
    detectedKinds,
    carriedOver,
    referencedToken,
  };
}

export interface RemoteMockDefaults {
  github: { owner: string; repo: string };
  gitlab: { owner: string; repo: string };
  gitea: { owner: string; repo: string };
  bitbucket: { owner: string; repo: string };
  azure_devops: { owner: string; repo: string };
}

/**
 * Append synthetic `[remote]` and `[remote.<kind>]` blocks for every
 * detected kind. `offline = true` is always added belt-and-suspenders. The
 * user's carried-over `owner`, `repo`, `api_url` are reused when present
 * and valid; otherwise we fall back to the supplied defaults.
 */
export function injectMockedRemoteBlocks(
  cleanedToml: string,
  detectedKinds: readonly RemoteKind[],
  carriedOver: Partial<Record<RemoteKind, CarriedOverFields>>,
  defaults: RemoteMockDefaults,
): string {
  if (detectedKinds.length === 0) return cleanedToml;

  const blocks: string[] = [];
  blocks.push("[remote]");
  blocks.push("offline = true");
  for (const kind of detectedKinds) {
    const co = carriedOver[kind] ?? {};
    const owner = co.owner ?? defaults[kind].owner;
    const repo = co.repo ?? defaults[kind].repo;
    blocks.push("");
    blocks.push(`[remote.${kind}]`);
    blocks.push(`owner = ${JSON.stringify(owner)}`);
    blocks.push(`repo = ${JSON.stringify(repo)}`);
    if (co.api_url) {
      blocks.push(`api_url = ${JSON.stringify(co.api_url)}`);
    }
    blocks.push(`token = ""`);
  }

  const sep = cleanedToml.endsWith("\n") ? "\n" : "\n\n";
  return `${cleanedToml}${sep}${blocks.join("\n")}\n`;
}
