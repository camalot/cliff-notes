import pkg from "../../package.json";

export interface SvgHostEntry {
  host: string;
  /** Params that must be present; adds them if missing. */
  must?: Record<string, string>;
}

export interface MarkdownSanitizerConfig {
  trustedSvgHosts: SvgHostEntry[];
}

const ALLOWED_TAGS = new Set([
  "details", "summary",
  "b", "strong", "i", "em", "u", "s", "strike", "ins", "del", "sub", "sup",
  "mark", "small", "kbd", "samp", "var", "q", "cite", "abbr", "dfn",
  "div", "span", "p", "br", "hr", "wbr", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "a", "img", "figure", "figcaption",
]);

// Tags removed along with all their content.
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed",
]);

const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "width", "height", "align",
]);

// `id` is only permitted on these tags.
const ID_ALLOWED_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "a"]);

function buildSvgHostMap(config: MarkdownSanitizerConfig): Map<string, SvgHostEntry> {
  return new Map(config.trustedSvgHosts.map((e) => [e.host.toLowerCase(), e]));
}

function isSvgPathname(url: string): boolean {
  try {
    const resolved = url.startsWith("//") ? "https:" + url : url;
    return new URL(resolved).pathname.toLowerCase().endsWith(".svg");
  } catch {
    return url.split("?")[0]!.toLowerCase().endsWith(".svg");
  }
}

function sanitizeSvgSrc(url: string, svgHostMap: Map<string, SvgHostEntry>): string | null {
  const resolved = url.startsWith("//") ? "https:" + url : url;

  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  const entry = svgHostMap.get(parsed.hostname.toLowerCase());
  if (!entry) {
    return null;
  }

  if (entry.must) {
    for (const [key, value] of Object.entries(entry.must)) {
      if (parsed.searchParams.get(key) !== value) {
        parsed.searchParams.set(key, value);
      }
    }
  }

  return parsed.toString();
}

function sanitizeAttr(
  tag: string,
  attrName: string,
  value: string,
  svgHostMap: Map<string, SvgHostEntry>,
): string | null {
  const trimmed = value.trim().toLowerCase();

  if (trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) {
    return null;
  }

  if (tag === "img" && attrName === "src" && isSvgPathname(value)) {
    // Only apply host restriction for absolute URLs.
    try {
      new URL(value.startsWith("//") ? "https:" + value : value);
      return sanitizeSvgSrc(value, svgHostMap);
    } catch {
      return value; // relative SVG src — allow
    }
  }

  return value;
}

function sanitizeElement(el: Element, svgHostMap: Map<string, SvgHostEntry>): void {
  const tag = el.tagName.toLowerCase();
  const toRemove: string[] = [];

  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();

    if (name === "id" && ID_ALLOWED_TAGS.has(tag)) {
      continue;
    }

    if (!ALLOWED_ATTRS.has(name)) {
      toRemove.push(attr.name);
      continue;
    }

    if (name === "href" || name === "src") {
      const sanitized = sanitizeAttr(tag, name, attr.value, svgHostMap);
      if (sanitized === null) {
        toRemove.push(attr.name);
      } else if (sanitized !== attr.value) {
        el.setAttribute(attr.name, sanitized);
      }
    }
  }

  for (const name of toRemove) {
    el.removeAttribute(name);
  }
}

function sanitizeNode(node: Node, svgHostMap: Map<string, SvgHostEntry>): void {
  let child = node.firstChild;

  while (child) {
    const next = child.nextSibling;

    if (child.nodeType === Node.COMMENT_NODE || child.nodeType === Node.TEXT_NODE) {
      child = next;
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      node.removeChild(child);
      child = next;
      continue;
    }

    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (DROP_WITH_CONTENT.has(tag)) {
      node.removeChild(el);
      child = next;
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: lift children into parent, then remove the disallowed element.
      const firstChild = el.firstChild;
      while (el.firstChild) {
        node.insertBefore(el.firstChild, el);
      }
      node.removeChild(el);
      // Continue from the first unwrapped child so it gets processed.
      child = firstChild ?? next;
      continue;
    }

    sanitizeElement(el, svgHostMap);
    sanitizeNode(el, svgHostMap);
    child = next;
  }
}

function loadConfig(): MarkdownSanitizerConfig {
  const raw = (pkg as Record<string, unknown>)["markdownSanitizer"];
  if (raw && typeof raw === "object" && "trustedSvgHosts" in raw) {
    return raw as MarkdownSanitizerConfig;
  }
  return { trustedSvgHosts: [] };
}

const defaultSvgHostMap = buildSvgHostMap(loadConfig());

export function sanitizeHtml(html: string, config?: MarkdownSanitizerConfig): string {
  const svgHostMap = config ? buildSvgHostMap(config) : defaultSvgHostMap;
  const container = document.createElement("div");
  container.innerHTML = html;
  sanitizeNode(container, svgHostMap);
  return container.innerHTML;
}
