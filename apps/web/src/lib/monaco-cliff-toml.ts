import type { Monaco } from "@monaco-editor/react";
import { bootstrapTextMate } from "./monaco/textmate-bootstrap";
import { registerTeraProviders } from "./monaco/tera-providers";

export const CLIFF_TOML_LANGUAGE_ID = "cliff-toml";
export const CLIFF_TOML_THEME_ID = "cliff-dark";
const DIAGNOSTICS_OWNER = "cliff-toml";

// ---------- Schema --------------------------------------------------------

const REMOTE_SUBSECTIONS = ["github", "gitlab", "gitea", "bitbucket", "azure_devops"];

const SECTION_HEADERS = [
  "bump",
  "changelog",
  "git",
  "remote.github",
  "remote.gitlab",
  "remote.gitea",
  "remote.bitbucket",
  "remote.azure_devops",
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
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) return null;
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

export async function registerCliffToml(monaco: Monaco): Promise<void> {
  const alreadyRegistered = monaco.languages
    .getLanguages()
    .some((l: { id: string }) => l.id === CLIFF_TOML_LANGUAGE_ID);
  if (!alreadyRegistered) {
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
  }

  defineCliffDarkTheme(monaco);

  // Tokenization is provided by a TextMate grammar (replaces the previous
  // Monarch tokenizer). Must complete before any model attached to this
  // language tokenizes its first line.
  await bootstrapTextMate(monaco, CLIFF_TOML_LANGUAGE_ID);

  registerTomlCompletion(monaco);
  registerTomlHover(monaco);
  registerTeraProviders(monaco, CLIFF_TOML_LANGUAGE_ID);

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

function defineCliffDarkTheme(monaco: Monaco): void {
  monaco.editor.defineTheme(CLIFF_TOML_THEME_ID, {
    base: "vs-dark",
    inherit: true,
    rules: [
      // TOML base
      { token: "comment", foreground: "64748B", fontStyle: "italic" },
      { token: "entity.name.section", foreground: "FACC15", fontStyle: "bold" },
      { token: "punctuation.definition.section", foreground: "FACC15" },
      { token: "support.type.property-name", foreground: "60A5FA" },
      { token: "support.type.property-name.tera-binding", foreground: "60A5FA", fontStyle: "bold" },
      { token: "support.type.property-name.regex", foreground: "60A5FA" },
      { token: "support.type.property-name.replace", foreground: "60A5FA" },
      { token: "punctuation.separator.key-value", foreground: "94A3B8" },
      { token: "punctuation.separator", foreground: "94A3B8" },
      { token: "punctuation.bracket", foreground: "94A3B8" },
      { token: "constant.language.boolean", foreground: "F472B6" },
      { token: "constant.numeric.integer", foreground: "FB923C" },
      { token: "constant.numeric.float", foreground: "FB923C" },

      // Strings
      { token: "string.quoted.double", foreground: "A7F3D0" },
      { token: "string.quoted.single", foreground: "A7F3D0" },
      { token: "string.quoted.triple", foreground: "A7F3D0" },
      { token: "punctuation.definition.string.template", foreground: "6EE7B7" },
      { token: "constant.character.escape", foreground: "FBBF24" },

      // Regex-valued fields
      { token: "string.regexp", foreground: "F0ABFC" },
      { token: "keyword.other.regexp.meta", foreground: "C084FC", fontStyle: "bold" },
      { token: "constant.character.escape.regexp", foreground: "FBBF24" },
      { token: "punctuation.definition.string.regex", foreground: "C084FC" },

      // Replacement templates ($1, ${1})
      { token: "string.template.replace", foreground: "A7F3D0" },
      { token: "punctuation.definition.string.replace", foreground: "6EE7B7" },
      { token: "variable.other.regexp.backreference", foreground: "FBBF24", fontStyle: "bold" },

      // Tera template
      { token: "punctuation.definition.template", foreground: "FCD34D", fontStyle: "bold" },
      { token: "comment.block.tera", foreground: "64748B", fontStyle: "italic" },
      { token: "punctuation.definition.comment.tera", foreground: "FCD34D" },
      { token: "keyword.control.tera", foreground: "F472B6", fontStyle: "bold" },
      { token: "constant.language.boolean.tera", foreground: "F472B6" },
      { token: "variable.language.tera", foreground: "F472B6", fontStyle: "italic" },
      { token: "support.function.filter.tera", foreground: "67E8F9" },
      { token: "support.function.builtin.tera", foreground: "67E8F9" },
      { token: "support.function.test.tera", foreground: "67E8F9" },
      { token: "variable.other.tera", foreground: "E2E8F0" },
      { token: "string.quoted.double.tera", foreground: "A7F3D0" },
      { token: "string.quoted.single.tera", foreground: "A7F3D0" },
      { token: "constant.numeric.tera", foreground: "FB923C" },
      { token: "keyword.operator.pipe.tera", foreground: "67E8F9" },
      { token: "keyword.operator.tera", foreground: "94A3B8" },
      { token: "punctuation.separator.tera", foreground: "94A3B8" },

      // Git commit message syntax (separate language)
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
}

function registerTomlCompletion(monaco: Monaco): void {
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

      const quoteCount = (textBefore.match(/(?<!\\)"/g) || []).length;
      const inString = quoteCount % 2 === 1;

      const lastOpenBrace = textBefore.lastIndexOf("{");
      const lastCloseBrace = textBefore.lastIndexOf("}");
      const inInlineTable = lastOpenBrace > lastCloseBrace;
      const arrayKey = inInlineTable
        ? findEnclosingArrayKey(model, lineNumber, textBefore, lastOpenBrace)
        : null;

      if (inString) {
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
}

function registerTomlHover(monaco: Monaco): void {
  monaco.languages.registerHoverProvider(CLIFF_TOML_LANGUAGE_ID, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provideHover: (model: any, position: any) => {
      const lineContent: string = model.getLineContent(position.lineNumber);
      const headerMatch = /^\s*\[(remote(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\]\s*$/.exec(
        lineContent.replace(/#.*$/, ""),
      );
      if (!headerMatch) return null;
      const open = lineContent.indexOf("[");
      const close = lineContent.indexOf("]");
      if (position.column < open + 1 || position.column > close + 2) return null;
      const header = headerMatch[1] ?? "";
      const lines = [
        `**\`[${header}]\` is mocked by cliff-notes**`,
        "",
        "cliff-notes strips `[remote.*]` sections before invoking git-cliff so no",
        "outbound API call is made and `token` is never written to disk. The",
        "section is replaced with deterministic mock data so templates that",
        "reference `commit.remote.*`, `<kind>.contributors`, and",
        "`remote.<kind>.{owner, repo}` still render.",
        "",
        "PR numbers, contributor lists, and `is_first_time` flags here will not",
        "match what real git-cliff would produce against your live repo.",
      ];
      return {
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: open + 1,
          endColumn: close + 2,
        },
        contents: [{ value: lines.join("\n") }],
      };
    },
  });
}
