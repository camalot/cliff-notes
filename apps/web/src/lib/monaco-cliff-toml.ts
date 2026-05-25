import type { Monaco } from "@monaco-editor/react";

export const CLIFF_TOML_LANGUAGE_ID = "cliff-toml";
export const CLIFF_TOML_THEME_ID = "cliff-dark";
const DIAGNOSTICS_OWNER = "cliff-toml";

// Names of fields whose string values are regular expressions in git-cliff.
const REGEX_FIELDS = ["pattern", "message", "tag_pattern"];
// Names of fields whose string values are replacement templates ($1, ${1}).
const REPLACE_FIELDS = ["replace", "href"];

const TERA_KEYWORDS = [
  "if", "elif", "else", "endif",
  "for", "endfor", "in",
  "block", "endblock", "extends", "include", "import",
  "macro", "endmacro", "raw", "endraw",
  "set", "filter", "endfilter", "as",
  "and", "or", "not", "is",
  "true", "false", "self",
];

const TERA_FILTERS = [
  "lower", "upper", "wordcount", "capitalize", "replace", "reverse", "length",
  "trim", "trim_start", "trim_end", "trim_start_matches", "trim_end_matches",
  "truncate", "linebreaksbr", "striptags", "join", "sort", "unique", "slice",
  "first", "last", "nth", "filter", "map", "group_by", "concat", "split",
  "int", "float", "round", "abs", "date", "get", "default", "escape",
  "safe", "upper_first", "lower_first", "title", "as_str", "json_encode",
];

// ---------- Schema --------------------------------------------------------

const REMOTE_SUBSECTIONS = ["github", "gitlab", "gitea", "bitbucket"];

const SECTION_HEADERS = [
  "bump",
  "changelog",
  "git",
  "remote.github",
  "remote.gitlab",
  "remote.gitea",
  "remote.bitbucket",
];

const SECTION_KEYS: Record<string, readonly string[]> = {
  bump: [
    "features_always_bump_minor",
    "breaking_always_bump_major",
    "initial_tag",
    "custom_increment_regex",
    "custom_major_increment_regex",
    "custom_minor_increment_regex",
  ],
  changelog: [
    "header",
    "body",
    "footer",
    "trim",
    "render_always",
    "postprocessors",
    "output",
  ],
  git: [
    "conventional_commits",
    "filter_unconventional",
    "require_conventional",
    "split_commits",
    "commit_preprocessors",
    "commit_parsers",
    "protect_breaking_commits",
    "filter_commits",
    "filter_merge_commits",
    "fail_on_unmatched_commit",
    "link_parsers",
    "use_branch_tags",
    "topo_order",
    "topo_order_commits",
    "sort_commits",
    "recurse_submodules",
    "tag_pattern",
    "skip_tags",
    "ignore_tags",
    "processing_order",
    "count_tags",
  ],
  remote: [
    "owner",
    "repo",
    "token",
    "is_custom",
    "api_url",
    "native_protocol",
  ],
};

const INLINE_TABLE_KEYS: Record<string, readonly string[]> = {
  commit_preprocessors: ["pattern", "replace", "replace_command"],
  postprocessors: ["pattern", "replace", "replace_command"],
  commit_parsers: [
    "message",
    "body",
    "footer",
    "sha",
    "field",
    "pattern",
    "default_scope",
    "group",
    "skip",
  ],
  link_parsers: ["pattern", "href", "text"],
};

const ENUM_VALUES: Record<string, readonly string[]> = {
  sort_commits: ["newest", "oldest"],
  processing_order: [
    "commit_preprocessors",
    "split_commits",
    "conventional_commits",
    "commit_parsers",
    "link_parsers",
  ],
  field: [
    "id",
    "message",
    "body",
    "footer",
    "author.name",
    "author.email",
    "committer.name",
    "committer.email",
  ],
};

// Keys whose presence in [remote.*] is a secret. Diagnostic warning is raised
// and the Share dialog renders a DANGER callout when one of these is found.
export const REMOTE_SECRET_KEYS: readonly string[] = ["token"];

// Detect whether a given cliff.toml string contains any of REMOTE_SECRET_KEYS
// assigned under a [remote.*] section.
export function cliffTomlContainsSecret(text: string): boolean {
  if (!text) return false;
  const lines = text.split(/\r?\n/);
  let inRemote = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "");
    const headerMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (headerMatch?.[1]) {
      inRemote = headerMatch[1].split(".")[0] === "remote";
      continue;
    }
    if (!inRemote) continue;
    const keyMatch = line.match(/^\s*([a-z_][a-z0-9_]*)\s*=/i);
    if (keyMatch?.[1] && REMOTE_SECRET_KEYS.includes(keyMatch[1].toLowerCase())) {
      return true;
    }
  }
  return false;
}

// ---------- Context helpers (for completions) -----------------------------

interface MonacoModel {
  getLineContent(line: number): string;
  getLineCount(): number;
  getWordUntilPosition(p: { lineNumber: number; column: number }): {
    word: string;
    startColumn: number;
    endColumn: number;
  };
  getLanguageId(): string;
  onDidChangeContent(cb: () => void): { dispose(): void };
}

function findCurrentSection(model: MonacoModel, lineNumber: number): string | null {
  for (let i = lineNumber; i >= 1; i--) {
    const line = model.getLineContent(i);
    const m = line.match(/^\s*\[([^\]]+)\]/);
    if (m?.[1]) return m[1];
  }
  return null;
}

// Walk backwards from `lineNumber` looking for an unmatched `[` that opens an
// array. Returns the key on the left of that `=`, or null.
function findEnclosingArrayKey(
  model: MonacoModel,
  lineNumber: number,
  textBeforeCursor: string,
  openBracePos: number,
): string | null {
  if (openBracePos >= 0) {
    const beforeBrace = textBeforeCursor.substring(0, openBracePos);
    const inlineMatch = beforeBrace.match(/(\w+)\s*=\s*\[/);
    if (inlineMatch?.[1]) return inlineMatch[1];
  }
  let depth = 0;
  for (let i = lineNumber - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) return null; // hit a section header
    for (let c = line.length - 1; c >= 0; c--) {
      const ch = line[c];
      if (ch === "]") depth++;
      else if (ch === "[") {
        if (depth === 0) {
          const before = line.substring(0, c);
          const m = before.match(/(\w+)\s*=\s*$/);
          return m?.[1] ?? null;
        }
        depth--;
      }
    }
  }
  return null;
}

// ---------- Diagnostics ---------------------------------------------------

function validate(monaco: Monaco, model: MonacoModel): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markers: any[] = [];
  let currentSection: string | null = null;
  let currentBase: string | null = null;

  for (let i = 1; i <= model.getLineCount(); i++) {
    const rawLine = model.getLineContent(i);
    const codeLine = rawLine.replace(/#.*$/, "");
    const trimmed = codeLine.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^\[([^\]]+)\]$/);
    const headerName = headerMatch?.[1];
    if (headerName) {
      currentSection = headerName;
      const parts = headerName.split(".");
      currentBase = parts[0] ?? null;
      const sub = parts[1] ?? null;
      const open = codeLine.indexOf("[");
      const close = codeLine.indexOf("]");

      if (!currentBase || !SECTION_KEYS[currentBase]) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `Unknown section '[${currentSection}]'. Expected one of: ${SECTION_HEADERS.join(", ")}.`,
          startLineNumber: i,
          startColumn: open + 1,
          endLineNumber: i,
          endColumn: close + 2,
        });
      } else if (currentBase === "remote" && sub && !REMOTE_SUBSECTIONS.includes(sub)) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `Unknown remote '${sub}'. Expected one of: ${REMOTE_SUBSECTIONS.join(", ")}.`,
          startLineNumber: i,
          startColumn: open + 1,
          endLineNumber: i,
          endColumn: close + 2,
        });
      }
      continue;
    }

    // Only validate top-level key lines (skip array-continuation lines, etc.).
    const keyMatch = trimmed.match(/^([a-z_][a-z0-9_]*)\s*=/i);
    const key = keyMatch?.[1];
    if (!key) continue;
    const validKeys = currentBase ? SECTION_KEYS[currentBase] : null;
    const keyStart = codeLine.indexOf(key);
    const keyEnd = keyStart + key.length;

    if (validKeys && !validKeys.includes(key)) {
      markers.push({
        severity: monaco.MarkerSeverity.Info,
        message: `Unknown key '${key}' in [${currentSection ?? ""}].`,
        startLineNumber: i,
        startColumn: keyStart + 1,
        endLineNumber: i,
        endColumn: keyEnd + 1,
      });
    }

    if (currentBase === "remote" && REMOTE_SECRET_KEYS.includes(key.toLowerCase())) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message:
          `'${key}' is a secret. cliff-notes stores your configuration only in this browser ` +
          `(it is never sent to the server), but Share links embed the entire config in the URL — ` +
          `anyone with the link will see this value.`,
        startLineNumber: i,
        startColumn: keyStart + 1,
        endLineNumber: i,
        endColumn: keyEnd + 1,
      });
    }

    // Single-line enum value: `sort_commits = "..."`
    const enumValues = ENUM_VALUES[key];
    if (enumValues) {
      const valueMatch = codeLine.match(/=\s*"([^"]*)"\s*$/);
      const value = valueMatch?.[1];
      if (value !== undefined && !enumValues.includes(value)) {
        const valStart = codeLine.lastIndexOf(`"${value}"`);
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `Invalid '${key}' value. Expected one of: ${enumValues.join(", ")}.`,
          startLineNumber: i,
          startColumn: valStart + 1,
          endLineNumber: i,
          endColumn: valStart + value.length + 3,
        });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monaco.editor.setModelMarkers(model as any, DIAGNOSTICS_OWNER, markers);
}

// ---------- Registration --------------------------------------------------

export function registerCliffToml(monaco: Monaco) {
  const alreadyRegistered = monaco.languages
    .getLanguages()
    .some((l: { id: string }) => l.id === CLIFF_TOML_LANGUAGE_ID);
  if (alreadyRegistered) return;

  monaco.languages.register({
    id: CLIFF_TOML_LANGUAGE_ID,
    extensions: [".toml"],
    aliases: ["cliff.toml", "git-cliff"],
  });

  monaco.languages.setLanguageConfiguration(CLIFF_TOML_LANGUAGE_ID, {
    comments: { lineComment: "#" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  const regexFieldsAlt = REGEX_FIELDS.join("|");
  const replaceFieldsAlt = REPLACE_FIELDS.join("|");

  monaco.languages.setMonarchTokensProvider(CLIFF_TOML_LANGUAGE_ID, {
    defaultToken: "",
    tokenPostfix: ".cliff",
    teraKeywords: TERA_KEYWORDS,
    teraFilters: TERA_FILTERS,

    tokenizer: {
      root: [
        [/\s+/, "white"],
        [/#.*$/, "comment"],
        [/^\s*\[\[[^\]]+\]\]/, "metatag"],
        [/^\s*\[[^\]]+\]/, "metatag"],

        // Any `key = """ ... """` is a Tera template.
        [/([A-Za-z_][A-Za-z0-9_-]*)(\s*)(=)(\s*)(""")/, [
          "type.identifier.tera",
          "white",
          "operator",
          "white",
          { token: "string.heredoc.delimiter", next: "@teraTemplate" },
        ]],

        // Regex-valued fields: pattern / message / tag_pattern
        [new RegExp(`(\\b(?:${regexFieldsAlt})\\b)(\\s*)(=)(\\s*)(")`), [
          "type.identifier",
          "white",
          "operator",
          "white",
          { token: "string.regexp.delimiter", next: "@regexStringDQ" },
        ]],
        [new RegExp(`(\\b(?:${regexFieldsAlt})\\b)(\\s*)(=)(\\s*)(')`), [
          "type.identifier",
          "white",
          "operator",
          "white",
          { token: "string.regexp.delimiter", next: "@regexStringSQ" },
        ]],

        // Replacement-template fields: replace / href
        [new RegExp(`(\\b(?:${replaceFieldsAlt})\\b)(\\s*)(=)(\\s*)(")`), [
          "type.identifier",
          "white",
          "operator",
          "white",
          { token: "string.replacement.delimiter", next: "@replaceStringDQ" },
        ]],
        [new RegExp(`(\\b(?:${replaceFieldsAlt})\\b)(\\s*)(=)(\\s*)(')`), [
          "type.identifier",
          "white",
          "operator",
          "white",
          { token: "string.replacement.delimiter", next: "@replaceStringSQ" },
        ]],

        // Generic key
        [/[A-Za-z_][A-Za-z0-9_-]*(?=\s*=)/, "type.identifier"],

        // Booleans
        [/\b(?:true|false)\b/, "keyword.boolean"],
        // Numbers
        [/-?\d+\.\d+(?:[eE][+-]?\d+)?/, "number.float"],
        [/-?\d+(?:[eE][+-]?\d+)?/, "number"],

        // Unattached triple-quoted strings (rare but possible).
        [/"""/, { token: "string.heredoc.delimiter", next: "@plainTripleDQ" }],
        [/'''/, { token: "string.heredoc.delimiter", next: "@plainTripleSQ" }],

        // Regular strings
        [/"/, { token: "string.quote", next: "@stringDQ" }],
        [/'/, { token: "string.quote", next: "@stringSQ" }],

        [/[=,]/, "operator"],
        [/[{}\[\]]/, "@brackets"],
      ],

      // ----- generic strings -----
      stringDQ: [
        [/\\./, "string.escape"],
        [/[^\\"]+/, "string"],
        [/"/, { token: "string.quote", next: "@pop" }],
      ],
      stringSQ: [
        [/[^']+/, "string"],
        [/'/, { token: "string.quote", next: "@pop" }],
      ],
      plainTripleDQ: [
        [/"""/, { token: "string.heredoc.delimiter", next: "@pop" }],
        [/\\./, "string.escape"],
        [/[^"\\]+/, "string"],
        [/"/, "string"],
      ],
      plainTripleSQ: [
        [/'''/, { token: "string.heredoc.delimiter", next: "@pop" }],
        [/[^']+/, "string"],
        [/'/, "string"],
      ],

      // ----- regex strings: highlight regex metachars + escapes -----
      regexStringDQ: [
        [/\\[\\"]/, "string.escape"],
        [/\\./, "regexp.escape"],
        [/[(){}\[\]|^$.*+?]/, "regexp.meta"],
        [/[^\\"]+/, "regexp"],
        [/"/, { token: "string.regexp.delimiter", next: "@pop" }],
      ],
      regexStringSQ: [
        [/\\./, "regexp.escape"],
        [/[(){}\[\]|^$.*+?]/, "regexp.meta"],
        [/[^\\']+/, "regexp"],
        [/'/, { token: "string.regexp.delimiter", next: "@pop" }],
      ],

      // ----- replacement strings: highlight $1 / ${1} backrefs -----
      replaceStringDQ: [
        [/\\./, "string.escape"],
        [/\$\{\d+\}/, "regexp.backreference"],
        [/\$\d+/, "regexp.backreference"],
        [/[^\\"$]+/, "string"],
        [/\$/, "string"],
        [/"/, { token: "string.replacement.delimiter", next: "@pop" }],
      ],
      replaceStringSQ: [
        [/\\./, "string.escape"],
        [/\$\{\d+\}/, "regexp.backreference"],
        [/\$\d+/, "regexp.backreference"],
        [/[^'$]+/, "string"],
        [/\$/, "string"],
        [/'/, { token: "string.replacement.delimiter", next: "@pop" }],
      ],

      // ----- any """ ... """ value with embedded Tera -----
      teraTemplate: [
        [/"""/, { token: "string.heredoc.delimiter", next: "@pop" }],
        [/\{#-?/, { token: "comment.tera", next: "@teraComment" }],
        [/\{%-?/, { token: "tag.tera", next: "@teraStmt" }],
        [/\{\{-?/, { token: "tag.tera", next: "@teraExpr" }],
        [/\\./, "string.escape"],
        [/[^{"\\]+/, "string"],
        [/\{/, "string"],
        [/"/, "string"],
      ],
      teraComment: [
        [/-?#\}/, { token: "comment.tera", next: "@pop" }],
        [/[^#-]+/, "comment.tera"],
        [/./, "comment.tera"],
      ],
      teraStmt: [
        [/-?%\}/, { token: "tag.tera", next: "@pop" }],
        { include: "@teraExpression" },
      ],
      teraExpr: [
        [/-?\}\}/, { token: "tag.tera", next: "@pop" }],
        { include: "@teraExpression" },
      ],
      teraExpression: [
        [/\s+/, "white"],
        [/"([^"\\]|\\.)*"/, "string.tera"],
        [/'([^'\\]|\\.)*'/, "string.tera"],
        [/\d+(?:\.\d+)?/, "number.tera"],
        [/\|/, "delimiter.pipe.tera"],
        [/[A-Za-z_][\w]*/, {
          cases: {
            "@teraKeywords": "keyword.tera",
            "@teraFilters": "support.function.tera",
            "@default": "identifier.tera",
          },
        }],
        [/[=<>!]=?|&&|\|\||[+\-*/%]/, "operator.tera"],
        [/[(),.:\[\]]/, "delimiter.tera"],
      ],
    },
  });

  monaco.editor.defineTheme(CLIFF_TOML_THEME_ID, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment.cliff", foreground: "64748B", fontStyle: "italic" },
      { token: "metatag.cliff", foreground: "FACC15", fontStyle: "bold" },
      { token: "type.identifier.cliff", foreground: "60A5FA" },
      { token: "type.identifier.tera.cliff", foreground: "60A5FA", fontStyle: "bold" },
      { token: "keyword.boolean.cliff", foreground: "F472B6" },
      { token: "number.cliff", foreground: "FB923C" },
      { token: "number.float.cliff", foreground: "FB923C" },
      { token: "operator.cliff", foreground: "94A3B8" },

      { token: "string.cliff", foreground: "A7F3D0" },
      { token: "string.quote.cliff", foreground: "6EE7B7" },
      { token: "string.heredoc.delimiter.cliff", foreground: "6EE7B7" },
      { token: "string.escape.cliff", foreground: "FBBF24" },

      // Regex-valued field strings
      { token: "regexp.cliff", foreground: "F0ABFC" },
      { token: "regexp.meta.cliff", foreground: "C084FC", fontStyle: "bold" },
      { token: "regexp.escape.cliff", foreground: "FBBF24" },
      { token: "string.regexp.delimiter.cliff", foreground: "C084FC" },

      // Replacement template strings
      { token: "string.replacement.delimiter.cliff", foreground: "6EE7B7" },
      { token: "regexp.backreference.cliff", foreground: "FBBF24", fontStyle: "bold" },

      // Tera
      { token: "tag.tera.cliff", foreground: "FCD34D", fontStyle: "bold" },
      { token: "comment.tera.cliff", foreground: "64748B", fontStyle: "italic" },
      { token: "keyword.tera.cliff", foreground: "F472B6", fontStyle: "bold" },
      { token: "support.function.tera.cliff", foreground: "67E8F9" },
      { token: "identifier.tera.cliff", foreground: "E2E8F0" },
      { token: "string.tera.cliff", foreground: "A7F3D0" },
      { token: "number.tera.cliff", foreground: "FB923C" },
      { token: "operator.tera.cliff", foreground: "94A3B8" },
      { token: "delimiter.tera.cliff", foreground: "94A3B8" },
      { token: "delimiter.pipe.tera.cliff", foreground: "67E8F9" },

      // Git commit message syntax (no .cliff suffix — different language)
      { token: "type.commit", foreground: "60A5FA" },
      { token: "type.breaking.commit", foreground: "EF4444", fontStyle: "bold" },
      { token: "scope.commit", foreground: "C084FC" },
      { token: "bang.commit", foreground: "EF4444", fontStyle: "bold" },
      { token: "operator.commit", foreground: "475569" },
      { token: "trailer.key.commit", foreground: "A5B4FC" },
      { token: "breaking.footer.commit", foreground: "EF4444", fontStyle: "bold" },
      { token: "bullet.commit", foreground: "F59E0B" },
      { token: "comment.commit", foreground: "4B5563", fontStyle: "italic" },
      { token: "separator.commit", foreground: "374151" },
    ],
    colors: {
      "editor.background": "#0F172A",
      "editor.foreground": "#E2E8F0",
      "editor.lineHighlightBackground": "#1E293B",
      "editorLineNumber.foreground": "#475569",
      "editorLineNumber.activeForeground": "#94A3B8",
      "editorIndentGuide.background": "#1E293B",
      "editorIndentGuide.activeBackground": "#334155",
      "editorWidget.background": "#0F172A",
      "editorWidget.border": "#334155",
      "editorSuggestWidget.background": "#0F172A",
      "scrollbarSlider.background": "#33415580",
      "scrollbarSlider.hoverBackground": "#475569B0",
      "scrollbarSlider.activeBackground": "#64748BC0",
      "minimap.background": "#0F172A",
      "minimapSlider.background": "#33415580",
      "minimapSlider.hoverBackground": "#475569B0",
      "minimapSlider.activeBackground": "#64748BC0",
    },
  });

  monaco.languages.registerCompletionItemProvider(CLIFF_TOML_LANGUAGE_ID, {
    triggerCharacters: ["[", ".", '"', "{", " ", "="],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provideCompletionItems: (model: any, position: any) => {
      const { lineNumber, column } = position;
      const lineContent: string = model.getLineContent(lineNumber);
      const textBefore = lineContent.substring(0, column - 1);
      const word = model.getWordUntilPosition(position);
      const wordRange = {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // 1. Typing a section header: `[<cursor>` or `[remote.<cursor>`
      const sectionHeaderMatch = textBefore.match(/^\s*\[([^\]\n]*)$/);
      if (sectionHeaderMatch) {
        const bracketStart = textBefore.lastIndexOf("[");
        const afterBracket = lineContent.substring(bracketStart + 1);
        const closeBracketRel = afterBracket.indexOf("]");
        const endCol =
          closeBracketRel >= 0 ? bracketStart + closeBracketRel + 2 : column;
        const sectionRange = {
          startLineNumber: lineNumber,
          endLineNumber: lineNumber,
          startColumn: bracketStart + 2,
          endColumn: endCol,
        };
        return {
          suggestions: SECTION_HEADERS.map((s) => ({
            label: s,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: s,
            range: sectionRange,
            detail: "cliff.toml section",
            sortText: `0_${s}`,
          })),
        };
      }

      const section = findCurrentSection(model, lineNumber);
      const baseSection = section?.split(".")[0] ?? null;

      // Detect whether the cursor sits inside a `"..."` value.
      const quoteCount = (textBefore.match(/(?<!\\)"/g) || []).length;
      const inString = quoteCount % 2 === 1;

      // Detect whether the cursor is inside an inline `{ ... }` table.
      const lastOpenBrace = textBefore.lastIndexOf("{");
      const lastCloseBrace = textBefore.lastIndexOf("}");
      const inInlineTable = lastOpenBrace > lastCloseBrace;
      const arrayKey = inInlineTable
        ? findEnclosingArrayKey(model, lineNumber, textBefore, lastOpenBrace)
        : null;

      if (inString) {
        // Find what key owns this string value.
        let valueKey: string | null = null;

        if (inInlineTable) {
          const inlineContent = textBefore.substring(lastOpenBrace + 1);
          const stringStart = inlineContent.lastIndexOf('"');
          if (stringStart >= 0) {
            const before = inlineContent.substring(0, stringStart);
            const m = before.match(/(\w+)\s*=\s*$/);
            valueKey = m?.[1] ?? null;
          }
        } else {
          const stringStart = textBefore.lastIndexOf('"');
          const before = textBefore.substring(0, stringStart);
          const m = before.match(/(\w+)\s*=\s*\[?\s*$/);
          if (m?.[1]) valueKey = m[1];
          else {
            // Multi-line array: walk back to find `key = [`.
            for (let i = lineNumber - 1; i >= 1; i--) {
              const line: string = model.getLineContent(i);
              const m2 = line.match(/^\s*(\w+)\s*=\s*\[/);
              if (m2?.[1]) {
                valueKey = m2[1];
                break;
              }
              if (/^\s*\[/.test(line)) break;
            }
          }
        }

        const valueEnum = valueKey ? ENUM_VALUES[valueKey] : null;
        if (valueKey && valueEnum) {
          const stringStartOnLine = textBefore.lastIndexOf('"');
          const stringRange = {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: stringStartOnLine + 2,
            endColumn: column,
          };
          return {
            suggestions: valueEnum.map((v) => ({
              label: v,
              kind: monaco.languages.CompletionItemKind.EnumMember,
              insertText: v,
              range: stringRange,
              detail: `${valueKey} value`,
              sortText: `0_${v}`,
            })),
          };
        }
        return { suggestions: [] };
      }

      // Inside an inline table — suggest object-shape keys for known arrays.
      if (inInlineTable && arrayKey && INLINE_TABLE_KEYS[arrayKey]) {
        return {
          suggestions: INLINE_TABLE_KEYS[arrayKey].map((k) => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: `${k} = `,
            range: wordRange,
            detail: `${arrayKey} field`,
            sortText: `0_${k}`,
          })),
        };
      }

      // Otherwise, suggest top-level keys for the current section.
      if (baseSection && SECTION_KEYS[baseSection] && /^\s*\w*$/.test(textBefore)) {
        return {
          suggestions: SECTION_KEYS[baseSection].map((k) => {
            const isSecret =
              baseSection === "remote" && REMOTE_SECRET_KEYS.includes(k);
            return {
              label: k,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: `${k} = `,
              range: wordRange,
              detail: isSecret
                ? "⚠ sensitive — visible in Share links"
                : `[${section}] key`,
              sortText: `${isSecret ? "9" : "0"}_${k}`,
            };
          }),
        };
      }

      return { suggestions: [] };
    },
  });

  // Diagnostics: validate existing and future models with this language id.
  const attach = (model: MonacoModel) => {
    if (model.getLanguageId() !== CLIFF_TOML_LANGUAGE_ID) return;
    validate(monaco, model);
    model.onDidChangeContent(() => validate(monaco, model));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monaco.editor.getModels().forEach(attach as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monaco.editor.onDidCreateModel(attach as any);
}
