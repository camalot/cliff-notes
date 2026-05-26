// Cursor-context inference for cliff.toml documents with embedded Tera templates.
//
// Given the full document text and a cursor offset, returns:
//   - what completion the user is asking for (intent)
//   - which named variables are in scope at the cursor (built-ins overlay + locally
//     bound `for x in y` / `set x = y` / macro args)
//   - the path before a trailing `.` for member completion
//
// The implementation is a small finite-state scanner. It is not a full Tera
// parser — it walks the text linearly, opening / closing triple-quoted strings
// and Tera blocks as it sees their delimiters, and tracks local bindings via a
// stack of frames pushed/popped on `for`/`endfor` etc.

export type CompletionIntent =
  | "none"
  | "tera_expression"
  | "tag_keyword"
  | "filter"
  | "test"
  | "member"
  | "for_iterable";

export type TypeRef =
  | { kind: "named"; name: string }
  | { kind: "element_of"; varName: string };

export interface Binding {
  name: string;
  typeRef: TypeRef;
}

export interface CursorContext {
  intent: CompletionIntent;
  bindings: Binding[];
  /** When intent is `member`, the identifier path before the trailing `.`. */
  path?: string[];
  /** When intent is `for_iterable`, the loop variable name being introduced. */
  loopVar?: string;
}

const IDENT_CHAR = /[A-Za-z0-9_]/;
const IDENT_HEAD = /[A-Za-z_]/;

type FrameKind = "for" | "if" | "macro" | "block" | "filter";
interface Frame {
  kind: FrameKind;
  bindings: Binding[];
}

interface ScannerState {
  inString: boolean;
  stringQuote: '"""' | "'''" | null;
  inExpr: boolean; // {{ }}
  inStmt: boolean; // {% %}
  inComment: boolean; // {# #}
  /** Offset at which the currently-open Tera block (expr/stmt/comment) began (the `{` of `{{`/`{%`/`{#`). */
  blockOpenedAt: number;
  /** Stack of `for`/`if`/etc. frames whose closing tag has not yet been seen. */
  stack: Frame[];
  /** `set`-introduced bindings, which persist until end of template. */
  setBindings: Binding[];
}

const TAG_OPEN_RE = /\{[{%#]-?/y;
const STRING_DELIM_RE = /"""|'''/y;

function findNextDelimiter(text: string, from: number): { idx: number; match: string } | null {
  // Find whichever comes first: `"""`, `'''`, `{{`, `{%`, or `{#` (each with optional `-`).
  let bestIdx = -1;
  let bestMatch = "";
  const candidates = ['"""', "'''", "{{", "{%", "{#"];
  for (const c of candidates) {
    const idx = text.indexOf(c, from);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx;
      bestMatch = c;
    }
  }
  if (bestIdx === -1) return null;
  return { idx: bestIdx, match: bestMatch };
}

function findCloser(text: string, from: number, close: string): number {
  // Tera close tags may be preceded by a `-` for whitespace control.
  const dashClose = "-" + close;
  const idxA = text.indexOf(close, from);
  const idxB = text.indexOf(dashClose, from);
  if (idxA === -1) return idxB;
  if (idxB === -1) return idxA;
  return Math.min(idxA, idxB);
}

/**
 * Walk the document linearly up to `cursor`, maintaining a stack of open
 * for/if/macro frames so we know which bindings are live at the cursor.
 */
function scanToCursor(text: string, cursor: number): ScannerState {
  const state: ScannerState = {
    inString: false,
    stringQuote: null,
    inExpr: false,
    inStmt: false,
    inComment: false,
    blockOpenedAt: -1,
    stack: [],
    setBindings: [],
  };

  let i = 0;
  while (i < cursor) {
    // Inside a Tera block: scan for the matching close.
    if (state.inExpr || state.inStmt || state.inComment) {
      const close = state.inExpr ? "}}" : state.inStmt ? "%}" : "#}";
      const closeAt = findCloser(text, i, close);
      if (closeAt === -1 || closeAt >= cursor) {
        // Block still open at cursor.
        return state;
      }
      // Process the statement before closing it, in case it introduces bindings.
      if (state.inStmt) {
        const stmtText = text.slice(state.blockOpenedAt + 2, closeAt).trim().replace(/^-/, "").replace(/-$/, "").trim();
        applyStatement(state, stmtText);
      }
      // Move past the closing delimiter (2 chars, or 3 if dash-trimmed).
      const dashTrimmed = text.startsWith("-", closeAt);
      i = closeAt + (dashTrimmed ? 3 : 2);
      state.inExpr = false;
      state.inStmt = false;
      state.inComment = false;
      state.blockOpenedAt = -1;
      continue;
    }

    // Inside a triple-quoted string but outside any Tera block: look for the
    // next delimiter (closing quote or opening Tera block).
    if (state.inString) {
      const next = findNextDelimiter(text, i);
      if (!next || next.idx >= cursor) {
        return state;
      }
      if (next.match === state.stringQuote) {
        state.inString = false;
        state.stringQuote = null;
        i = next.idx + 3;
        continue;
      }
      if (next.match === "{{") {
        state.inExpr = true;
        state.blockOpenedAt = next.idx;
        i = next.idx + 2;
        if (text.startsWith("-", i)) i += 1;
        continue;
      }
      if (next.match === "{%") {
        state.inStmt = true;
        state.blockOpenedAt = next.idx;
        i = next.idx + 2;
        if (text.startsWith("-", i)) i += 1;
        continue;
      }
      if (next.match === "{#") {
        state.inComment = true;
        state.blockOpenedAt = next.idx;
        i = next.idx + 2;
        if (text.startsWith("-", i)) i += 1;
        continue;
      }
      // The other quote kind appeared in our string text — just skip it.
      i = next.idx + 3;
      continue;
    }

    // Outside any string: look for the next triple-quote opener.
    const next = findNextDelimiter(text, i);
    if (!next || next.idx >= cursor) {
      return state;
    }
    if (next.match === '"""' || next.match === "'''") {
      state.inString = true;
      state.stringQuote = next.match as '"""' | "'''";
      i = next.idx + 3;
      continue;
    }
    // {{ / {% / {# outside a string are just TOML text; skip them.
    i = next.idx + 2;
  }

  return state;
}

function applyStatement(state: ScannerState, stmt: string): void {
  // for X in EXPR
  const forMatch = stmt.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z_][A-Za-z0-9_]*))?\s+in\s+(.+)$/);
  if (forMatch) {
    const var1 = forMatch[1]!;
    const var2 = forMatch[2];
    const iterableExpr = forMatch[3]!.trim();
    const bindings: Binding[] = [];
    if (var2) {
      // `for k, v in mapping`: k is a string (map key), v is the value type
      bindings.push({ name: var1, typeRef: { kind: "named", name: "string" } });
      bindings.push({ name: var2, typeRef: { kind: "element_of", varName: iterableExpr } });
    } else {
      bindings.push({ name: var1, typeRef: { kind: "element_of", varName: iterableExpr } });
    }
    state.stack.push({ kind: "for", bindings });
    return;
  }

  // endfor / endif / endmacro / endblock / endfilter
  const endMatch = stmt.match(/^end(for|if|macro|block|filter)\b/);
  if (endMatch) {
    const kind = endMatch[1] as FrameKind;
    // Pop until we find this kind (defensive against unbalanced templates).
    for (let i = state.stack.length - 1; i >= 0; i--) {
      if (state.stack[i]!.kind === kind) {
        state.stack.splice(i);
        return;
      }
    }
    return;
  }

  // if / elif → push if frame on `if`; reuse on `elif`.
  if (/^if\b/.test(stmt)) {
    state.stack.push({ kind: "if", bindings: [] });
    return;
  }

  // macro name(arg1, arg2=default)
  const macroMatch = stmt.match(/^macro\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/);
  if (macroMatch) {
    const args = macroMatch[1]!
      .split(",")
      .map((a) => a.split("=")[0]!.trim())
      .filter((a) => IDENT_HEAD.test(a))
      .map((name) => ({ name, typeRef: { kind: "named", name: "any" } as TypeRef }));
    state.stack.push({ kind: "macro", bindings: args });
    return;
  }

  // block name
  if (/^block\s+/.test(stmt)) {
    state.stack.push({ kind: "block", bindings: [] });
    return;
  }

  // filter name
  if (/^filter\s+/.test(stmt)) {
    state.stack.push({ kind: "filter", bindings: [] });
    return;
  }

  // set X = EXPR  (also set_global)
  const setMatch = stmt.match(/^set(?:_global)?\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (setMatch) {
    state.setBindings.push({
      name: setMatch[1]!,
      typeRef: { kind: "element_of", varName: setMatch[2]!.trim() },
    });
  }
}

function liveBindings(state: ScannerState): Binding[] {
  const out: Binding[] = [...state.setBindings];
  for (const frame of state.stack) {
    out.push(...frame.bindings);
  }
  return out;
}

/**
 * Walk backward from `cursor - 1` collecting identifier path segments separated
 * by `.`. Returns the segments (most distant first) and the offset of the
 * earliest character consumed.
 */
function collectPathBefore(text: string, cursor: number): { path: string[]; start: number } {
  const segments: string[] = [];
  let i = cursor - 1;
  let segEnd = -1;

  while (i >= 0) {
    const ch = text[i]!;
    if (IDENT_CHAR.test(ch)) {
      if (segEnd === -1) segEnd = i + 1;
      i--;
      continue;
    }
    if (segEnd !== -1) {
      segments.unshift(text.slice(i + 1, segEnd));
      segEnd = -1;
    }
    if (ch === ".") {
      i--;
      continue;
    }
    break;
  }

  if (segEnd !== -1 && i < 0) {
    segments.unshift(text.slice(0, segEnd));
  } else if (segEnd !== -1) {
    segments.unshift(text.slice(i + 1, segEnd));
  }

  return { path: segments, start: i + 1 };
}

/** Compute the substring of the current Tera block from its open to the cursor. */
function currentBlockText(state: ScannerState, text: string, cursor: number): string {
  if (state.blockOpenedAt < 0) return "";
  // Skip the leading `{{` / `{%` / `{#` plus optional dash.
  let start = state.blockOpenedAt + 2;
  if (text[start] === "-") start += 1;
  return text.slice(start, cursor);
}

export function cursorContext(text: string, cursor: number): CursorContext {
  if (cursor < 0) cursor = 0;
  if (cursor > text.length) cursor = text.length;
  const state = scanToCursor(text, cursor);

  if (!state.inString) {
    return { intent: "none", bindings: [] };
  }
  if (state.inComment) {
    return { intent: "none", bindings: [] };
  }
  if (!state.inExpr && !state.inStmt) {
    return { intent: "none", bindings: [] };
  }

  const bindings = liveBindings(state);
  const blockText = currentBlockText(state, text, cursor);
  const trimmedBlock = blockText.replace(/^\s+/, "");

  // Empty Tera statement → completing a tag keyword.
  if (state.inStmt && /^\s*$/.test(blockText)) {
    return { intent: "tag_keyword", bindings };
  }

  // `for X in <cursor>`
  const forMatch = trimmedBlock.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)?\s+in\s+([^|]*)$/);
  if (state.inStmt && forMatch) {
    return {
      intent: "for_iterable",
      bindings,
      loopVar: forMatch[1]!,
    };
  }

  // After `|`: filter expected. The block may contain earlier `|`s — we want the
  // one most recent before the cursor.
  const lastPipe = blockText.lastIndexOf("|");
  const lastIs = lastBareIsKeyword(blockText);
  const lastDot = lastDotForMember(text, cursor);
  // Whichever of these is the closest to cursor (and after a whitespace boundary) wins.
  const candidates: Array<{ kind: CompletionIntent; offset: number; extra?: () => CursorContext }> = [];

  if (lastPipe !== -1 && /^[\s|]*[A-Za-z_]*$/.test(blockText.slice(lastPipe + 1))) {
    candidates.push({ kind: "filter", offset: lastPipe });
  }

  if (lastIs.offset !== -1) {
    candidates.push({ kind: "test", offset: lastIs.offset });
  }

  if (lastDot !== -1) {
    candidates.push({
      kind: "member",
      offset: lastDot,
      extra: () => {
        const { path } = collectPathBefore(text, lastDot);
        return { intent: "member", bindings, path };
      },
    });
  }

  candidates.sort((a, b) => b.offset - a.offset);
  const winner = candidates[0];
  if (winner) {
    if (winner.extra) return winner.extra();
    return { intent: winner.kind, bindings };
  }

  return { intent: "tera_expression", bindings };
}

function lastBareIsKeyword(blockText: string): { offset: number } {
  // Look for `is` (or `is not`) as a whole word.
  const re = /\bis(?:\s+not)?\b/g;
  let m: RegExpExecArray | null;
  let last = -1;
  while ((m = re.exec(blockText)) !== null) {
    last = m.index;
  }
  if (last === -1) return { offset: -1 };
  // Only treat as `test` intent if the cursor is in the "expected test name" position,
  // i.e. whitespace + optional identifier prefix follows the keyword.
  const after = blockText.slice(last).replace(/^is(?:\s+not)?/, "");
  if (/^\s+[A-Za-z_]*$/.test(after) || /^\s*$/.test(after)) {
    return { offset: last };
  }
  return { offset: -1 };
}

function lastDotForMember(text: string, cursor: number): number {
  // The cursor is in "member" position if the character just before it (after
  // skipping any in-progress identifier chars) is `.` AND the char before that
  // is an identifier char.
  let i = cursor - 1;
  while (i >= 0 && IDENT_CHAR.test(text[i]!)) i--;
  if (i < 0 || text[i] !== ".") return -1;
  if (i === 0) return -1;
  if (!IDENT_CHAR.test(text[i - 1]!)) return -1;
  return i;
}
