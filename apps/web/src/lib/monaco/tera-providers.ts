import type { Monaco } from "@monaco-editor/react";
import {
  completionsAt,
  hoverAt,
  signatureHelpAt,
  type CompletionItem,
  type CompletionItemKind,
  type TeraParam,
} from "@cliff-notes/tera-lang";

const registered = new WeakSet<Monaco>();

/**
 * Register completion + hover providers that consume @cliff-notes/tera-lang.
 * Idempotent per Monaco instance.
 */
export function registerTeraProviders(monaco: Monaco, languageId: string): void {
  if (registered.has(monaco)) return;
  registered.add(monaco);

  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: [".", "|", " ", "{", "%"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provideCompletionItems: (model: any, position: any) => {
      const offset = model.getOffsetAt(position);
      const text = model.getValue() as string;
      const items = completionsAt(text, offset);
      if (items.length === 0) return { suggestions: [] };

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return {
        suggestions: items.map((item) => toMonacoCompletion(monaco, item, range)),
      };
    },
  });

  monaco.languages.registerHoverProvider(languageId, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provideHover: (model: any, position: any) => {
      const offset = model.getOffsetAt(position);
      const text = model.getValue() as string;
      const hover = hoverAt(text, offset);
      if (!hover) return null;
      return {
        contents: [{ value: hover.markdown }],
      };
    },
  });

  monaco.languages.registerSignatureHelpProvider(languageId, {
    signatureHelpTriggerCharacters: ["(", ","],
    signatureHelpRetriggerCharacters: [","],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provideSignatureHelp: (model: any, position: any) => {
      const offset = model.getOffsetAt(position);
      const text = model.getValue() as string;
      const info = signatureHelpAt(text, offset);
      if (!info) return null;
      return {
        value: {
          signatures: [
            {
              label: info.signature,
              documentation: { value: composeSignatureDoc(info.description, info.params) },
              parameters: info.params.map((p) => ({
                label: paramLabelInSignature(info.signature, p.name),
                documentation: paramDoc(p),
              })),
            },
          ],
          activeSignature: 0,
          activeParameter: info.activeParameter,
        },
        dispose: () => {},
      };
    },
  });
}

function composeSignatureDoc(description: string, params: readonly TeraParam[]): string {
  if (params.length === 0) return description;
  const lines = [description, ""];
  for (const p of params) {
    const dflt = p.default !== undefined ? `= \`${p.default}\`` : p.required === false ? "_(optional)_" : "**required**";
    lines.push(`- \`${p.name}\` _(${p.type ?? "any"})_ ${dflt}`);
  }
  return lines.join("\n");
}

function paramLabelInSignature(signature: string, paramName: string): [number, number] {
  // Find the literal parameter name in the signature so Monaco can highlight it.
  // Falls back to [0,0] if not found, which is harmless (no highlight).
  const re = new RegExp(`\\b${paramName}\\b`);
  const m = re.exec(signature);
  if (!m) return [0, 0];
  return [m.index, m.index + paramName.length];
}

function paramDoc(p: TeraParam): string {
  const parts: string[] = [];
  if (p.type) parts.push(`type: \`${p.type}\``);
  if (p.default !== undefined) parts.push(`default: \`${p.default}\``);
  else if (p.required !== false) parts.push("**required**");
  return parts.join(" · ");
}

function toMonacoCompletion(
  monaco: Monaco,
  item: CompletionItem,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  range: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const kindMap = monaco.languages.CompletionItemKind;
  const kindFor = (k: CompletionItemKind) => {
    switch (k) {
      case "variable":
        return kindMap.Variable;
      case "property":
        return kindMap.Property;
      case "function":
        return kindMap.Function;
      case "filter":
        return kindMap.Method;
      case "test":
        return kindMap.Keyword;
      case "keyword":
        return kindMap.Keyword;
      case "snippet":
        return kindMap.Snippet;
    }
  };

  const detail = item.source ? `${item.detail ?? ""} · ${item.source}` : item.detail;
  const insertText = item.insertText ?? item.label;
  const insertTextRules = item.insertTextIsSnippet
    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
    : undefined;

  return {
    label: item.label,
    kind: kindFor(item.kind),
    insertText,
    range,
    detail,
    documentation: item.documentation ? { value: item.documentation } : undefined,
    sortText: kindSortPrefix(item.kind) + item.label,
    ...(insertTextRules !== undefined ? { insertTextRules } : {}),
  };
}

function kindSortPrefix(kind: CompletionItemKind): string {
  // Put properties/variables ahead of filters/tests/snippets so member access
  // completion shows real fields first.
  switch (kind) {
    case "property":
      return "1_";
    case "variable":
      return "2_";
    case "function":
      return "3_";
    case "filter":
    case "test":
    case "keyword":
      return "4_";
    case "snippet":
      return "5_";
  }
}
