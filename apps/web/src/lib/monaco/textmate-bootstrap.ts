import type { Monaco } from "@monaco-editor/react";
import { loadWASM } from "onigasm";
import { Registry } from "monaco-textmate";
import { wireTmGrammars } from "monaco-editor-textmate";

import onigasmWasm from "onigasm/lib/onigasm.wasm?url";
import cliffTomlGrammar from "@cliff-notes/tera-lang/grammars/cliff-toml.tmLanguage.json";

const SCOPE_NAME = "source.cliff-toml";

let wasmLoaded: Promise<void> | null = null;
const wiredMonacos = new WeakSet<Monaco>();

function ensureWasmLoaded(): Promise<void> {
  if (!wasmLoaded) {
    wasmLoaded = loadWASM(onigasmWasm).catch((err) => {
      // If WASM is loaded twice (e.g. HMR), onigasm throws. Treat as benign.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already")) return;
      throw err;
    });
  }
  return wasmLoaded;
}

/**
 * Wire the TextMate grammar to Monaco. Must be called after the language is
 * registered with `monaco.languages.register({ id })` and before any model
 * starts tokenizing. Safe to call multiple times.
 */
export async function bootstrapTextMate(monaco: Monaco, languageId: string): Promise<void> {
  await ensureWasmLoaded();
  if (wiredMonacos.has(monaco)) return;

  const registry = new Registry({
    getGrammarDefinition: async (scopeName: string) => {
      if (scopeName === SCOPE_NAME) {
        return { format: "json", content: JSON.stringify(cliffTomlGrammar) };
      }
      throw new Error(`Unknown grammar scope requested: ${scopeName}`);
    },
  });

  const grammars = new Map<string, string>();
  grammars.set(languageId, SCOPE_NAME);

  // wireTmGrammars replaces Monaco's tokenizer for the listed languages with
  // the TextMate registry. It returns once all grammars are loaded.
  await wireTmGrammars(monaco, registry, grammars);
  wiredMonacos.add(monaco);
}
