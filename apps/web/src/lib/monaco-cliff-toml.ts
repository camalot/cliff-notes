import type { Monaco } from "@monaco-editor/react";

export const CLIFF_TOML_LANGUAGE_ID = "cliff-toml";
export const CLIFF_TOML_THEME_ID = "cliff-dark";

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

        // body = """ ... """  → Tera-aware multiline string
        [/(body)(\s*)(=)(\s*)(""")/, [
          "type.identifier.body",
          "white",
          "operator",
          "white",
          { token: "string.heredoc.delimiter", next: "@bodyTemplate" },
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

        // Triple-quoted strings (not body)
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

      // ----- body = """ ... """  with embedded Tera -----
      bodyTemplate: [
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
      { token: "type.identifier.body.cliff", foreground: "60A5FA", fontStyle: "bold" },
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
