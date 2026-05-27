import MarkdownIt from "markdown-it";
import { alert } from "@mdit/plugin-alert";
import { fullEmoji } from "@mdit/plugin-emoji";
import { katex } from "@mdit/plugin-katex";
import { sanitizeHtml } from "./sanitize";

let md: MarkdownIt | null = null;

function getMarkdownInstance(): MarkdownIt {
  if (!md) {
    md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: false,
    });
    md.use(alert);
    md.use(fullEmoji);
    md.use(katex);

    // Sanitize only raw HTML passthrough from the source, not renderer-generated HTML.
    md.renderer.rules["html_block"] = (tokens, idx) => sanitizeHtml(tokens[idx]!.content);
    md.renderer.rules["html_inline"] = (tokens, idx) => sanitizeHtml(tokens[idx]!.content);
  }
  return md;
}

export function renderMarkdown(source: string): string {
  return getMarkdownInstance().render(source);
}
