import { describe, it, expect } from "vitest";
import { sanitizeHtml, type MarkdownSanitizerConfig } from "./sanitize";

const cfg: MarkdownSanitizerConfig = {
  trustedSvgHosts: [
    { host: "img.shields.io" },
    { host: "raw.githubusercontent.com", must: { sanitize: "true" } },
  ],
};

const s = (html: string) => sanitizeHtml(html, cfg);

describe("sanitizeHtml", () => {
  describe("allowed tags", () => {
    it("preserves allowed inline tags", () => {
      expect(s("<b>bold</b>")).toBe("<b>bold</b>");
      expect(s("<em>italic</em>")).toBe("<em>italic</em>");
      expect(s("<code>code</code>")).toBe("<code>code</code>");
    });

    it("preserves allowed block tags", () => {
      expect(s("<p>para</p>")).toBe("<p>para</p>");
      expect(s("<h1>title</h1>")).toBe("<h1>title</h1>");
      expect(s("<ul><li>item</li></ul>")).toBe("<ul><li>item</li></ul>");
    });

    it("preserves table structure", () => {
      const table = "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>";
      expect(s(table)).toBe(table);
    });

    it("preserves details/summary", () => {
      const html = "<details><summary>title</summary><p>body</p></details>";
      expect(s(html)).toBe(html);
    });
  });

  describe("disallowed tags", () => {
    it("strips script tags and their content", () => {
      expect(s("<script>alert(1)</script>")).toBe("");
    });

    it("strips style tags and their content", () => {
      expect(s("<style>.foo{color:red}</style>")).toBe("");
    });

    it("strips iframe and its content", () => {
      expect(s('<iframe src="https://evil.com"></iframe>')).toBe("");
    });

    it("unwraps unknown tags but keeps their text", () => {
      expect(s("<custom-tag>text</custom-tag>")).toBe("text");
    });

    it("unwraps nested unknown tags", () => {
      expect(s("<foo><b>bold</b></foo>")).toBe("<b>bold</b>");
    });
  });

  describe("attributes", () => {
    it("allows safe attributes", () => {
      expect(s('<img src="https://img.shields.io/badge.svg" alt="badge" title="t" width="80" height="20">')).toBe(
        '<img src="https://img.shields.io/badge.svg" alt="badge" title="t" width="80" height="20">',
      );
    });

    it("removes class and style attributes", () => {
      expect(s('<p class="foo" style="color:red">text</p>')).toBe("<p>text</p>");
    });

    it("removes data-* attributes", () => {
      expect(s('<span data-value="x">text</span>')).toBe("<span>text</span>");
    });

    it("allows id on heading tags", () => {
      expect(s('<h2 id="sec">title</h2>')).toBe('<h2 id="sec">title</h2>');
    });

    it("allows id on anchor tags", () => {
      expect(s('<a id="ref" href="https://example.com">link</a>')).toBe(
        '<a id="ref" href="https://example.com">link</a>',
      );
    });

    it("removes id from non-heading/anchor tags", () => {
      expect(s('<p id="foo">text</p>')).toBe("<p>text</p>");
    });
  });

  describe("unsafe URL schemes", () => {
    it("removes javascript: hrefs", () => {
      expect(s('<a href="javascript:alert(1)">click</a>')).toBe("<a>click</a>");
    });

    it("removes data: srcs", () => {
      expect(s('<img src="data:image/png;base64,abc">')).toBe("<img>");
    });

    it("removes data: hrefs", () => {
      expect(s('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toBe("<a>x</a>");
    });
  });

  describe("SVG images", () => {
    it("allows SVG from trusted host", () => {
      expect(s('<img src="https://img.shields.io/badge/foo-bar.svg">')).toBe(
        '<img src="https://img.shields.io/badge/foo-bar.svg">',
      );
    });

    it("blocks SVG from untrusted host", () => {
      expect(s('<img src="https://evil.com/xss.svg">')).toBe("<img>");
    });

    it("blocks SVG over http", () => {
      expect(s('<img src="http://img.shields.io/badge/foo.svg">')).toBe("<img>");
    });

    it("injects missing required param", () => {
      expect(s('<img src="https://raw.githubusercontent.com/user/repo/main/badge.svg">')).toBe(
        '<img src="https://raw.githubusercontent.com/user/repo/main/badge.svg?sanitize=true">',
      );
    });

    it("keeps existing required param when already present", () => {
      expect(s('<img src="https://raw.githubusercontent.com/user/repo/main/badge.svg?sanitize=true">')).toBe(
        '<img src="https://raw.githubusercontent.com/user/repo/main/badge.svg?sanitize=true">',
      );
    });

    it("injects required param alongside existing query params", () => {
      expect(s('<img src="https://raw.githubusercontent.com/user/repo/main/badge.svg?foo=1">')).toBe(
        '<img src="https://raw.githubusercontent.com/user/repo/main/badge.svg?foo=1&amp;sanitize=true">',
      );
    });

    it("recognises sanitize=true anywhere in the query string", () => {
      expect(s('<img src="https://raw.githubusercontent.com/user/repo/main/badge.svg?foo=1&sanitize=true&bar=2">')).toBe(
        '<img src="https://raw.githubusercontent.com/user/repo/main/badge.svg?foo=1&amp;sanitize=true&amp;bar=2">',
      );
    });

    it("allows relative SVG srcs", () => {
      expect(s('<img src="images/logo.svg" alt="logo">')).toBe('<img src="images/logo.svg" alt="logo">');
    });

    it("non-SVG images are not subject to trusted-host restriction", () => {
      expect(s('<img src="https://example.com/photo.png" alt="photo">')).toBe(
        '<img src="https://example.com/photo.png" alt="photo">',
      );
    });
  });

  describe("HTML comments", () => {
    it("preserves HTML comments", () => {
      expect(s("<!-- comment -->")).toBe("<!-- comment -->");
    });

    it("preserves comments among other content", () => {
      expect(s("<p>before</p><!-- note --><p>after</p>")).toBe("<p>before</p><!-- note --><p>after</p>");
    });
  });
});
