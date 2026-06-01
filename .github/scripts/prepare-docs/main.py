#!/usr/bin/env python3
"""Generate Jekyll documentation pages and _includes symlinks from markdown files.

Traverse the repository for markdown files carrying a `drjekyll` header comment:

    <!-- drjekyll
    ---
    title: Built-in cliff.toml
    -->

The comment body is YAML metadata. In every directory that contains a README.md
with such a header, the README becomes the index page and any sibling markdown
files that also carry the header become its child pages. A child's parent is
taken from its own `parent` metadata, falling back to the README's title (and the
README's own `parent`, when present, becomes the child's grand_parent). If a
directory has header-bearing markdown files but no README.md with a header, those
files are ignored and logged.
"""

import os
import re
from collections import defaultdict
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader

REPO_ROOT = Path(__file__).resolve().parents[3]
DOCS_DIR = REPO_ROOT / "docs"
INCLUDES_DIR = DOCS_DIR / "_includes"
TEMPLATES_DIR = REPO_ROOT / ".github" / "templates"

EXCLUDE_DIRS = {".git", ".github", "_docs", "docs", "_site", "node_modules"}

# Matches the leading drjekyll header comment and captures its YAML body.
DRJEKYLL_RE = re.compile(r"<!--\s*drjekyll\b\s*\n?---\s*\n(.*?)\n?-->", re.DOTALL)


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def parse_drjekyll_header(path: Path) -> dict | None:
    """Return the YAML metadata from a file's drjekyll header, or None if absent."""
    content = path.read_text(encoding="utf-8")
    m = DRJEKYLL_RE.search(content)
    if not m:
        return None
    return yaml.safe_load(m.group(1)) or {}


def find_documented_markdown() -> dict[Path, list[tuple[Path, dict]]]:
    """Group header-bearing markdown files by their parent directory."""
    by_dir: dict[Path, list[tuple[Path, dict]]] = defaultdict(list)
    for path in sorted(REPO_ROOT.rglob("*.md")):
        parts = path.relative_to(REPO_ROOT).parts
        if any(part in EXCLUDE_DIRS for part in parts):
            continue
        meta = parse_drjekyll_header(path)
        if meta is not None:
            by_dir[path.parent].append((path, meta))
    return by_dir


def docs_parts(dir_path: Path) -> tuple[str, ...]:
    """Repo-relative parts of dir_path with leading dots stripped from each segment.

    Jekyll ignores files and directories beginning with a dot, so a source path
    like ``.cliff/tomls`` is published under ``docs/cliff/tomls``.
    """
    return tuple(p.lstrip(".") for p in dir_path.relative_to(REPO_ROOT).parts)


# ---------------------------------------------------------------------------
# Front-matter helpers (read from already-generated docs to preserve nav_order)
# ---------------------------------------------------------------------------

def parse_front_matter(path: Path) -> dict:
    content = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    return yaml.safe_load(m.group(1)) or {} if m else {}


def read_nav_order(path: Path) -> int | None:
    if not path.exists():
        return None
    fm = parse_front_matter(path)
    v = fm.get("nav_order")
    return int(v) if v is not None else None


# ---------------------------------------------------------------------------
# nav_order calculation
# ---------------------------------------------------------------------------

def next_nav_order(existing: dict[str, int]) -> int:
    """Return the next nav_order, inserting before any sentinel at the bottom.

    A sentinel is detected when the last item's gap from its predecessor is
    significantly larger than the typical inter-item gap (>3x and >= 5).
    """
    values = sorted(existing.values())
    if not values:
        return 1
    if len(values) == 1:
        return values[0] + 1

    gaps = [values[i + 1] - values[i] for i in range(len(values) - 1)]
    if len(gaps) >= 2:
        typical = sum(gaps[:-1]) / len(gaps[:-1])
        if gaps[-1] >= 5 and gaps[-1] > typical * 3:
            return values[-2] + 1
    elif gaps[0] >= 20:
        # Only two items; a large gap implies the higher one is a sentinel.
        return values[0] + 1

    return values[-1] + 1


# ---------------------------------------------------------------------------
# Symlink helpers
# ---------------------------------------------------------------------------

def create_symlink(link_path: Path, target: Path) -> None:
    if link_path.is_symlink() or link_path.exists():
        link_path.unlink()
    link_path.symlink_to(target)


def create_include_symlink(source: Path, symlink_name: str) -> str:
    """Symlink an _includes entry to source. Returns the symlink filename."""
    rel_target = Path(os.path.relpath(source, INCLUDES_DIR))
    create_symlink(INCLUDES_DIR / symlink_name, rel_target)
    return symlink_name


# ---------------------------------------------------------------------------
# Existing nav_order loading
# ---------------------------------------------------------------------------

def load_existing_nav_orders() -> tuple[
    dict[tuple, int],
    defaultdict[tuple, dict[str, int]],
]:
    """Scan the existing docs tree and return preserved nav_order values.

    Returns:
        index_nav_orders  – {dir_parts_tuple: nav_order} for every index.md
        page_nav_orders   – {parent_dir_tuple: {slug: nav_order}} for every
                            non-index page
    """
    index_nav_orders: dict[tuple, int] = {}
    page_nav_orders: defaultdict[tuple, dict[str, int]] = defaultdict(dict)

    for index_md in sorted(DOCS_DIR.rglob("index.md")):
        try:
            rel_parts = index_md.parent.relative_to(DOCS_DIR).parts
        except ValueError:
            continue
        v = read_nav_order(index_md)
        if v is not None:
            index_nav_orders[rel_parts] = v

    for md in sorted(DOCS_DIR.rglob("*.md")):
        if md.name == "index.md":
            continue
        try:
            parent_parts = md.parent.relative_to(DOCS_DIR).parts
        except ValueError:
            continue
        v = read_nav_order(md)
        if v is not None:
            page_nav_orders[parent_parts][md.stem] = v

    return index_nav_orders, page_nav_orders


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    INCLUDES_DIR.mkdir(parents=True, exist_ok=True)

    jinja_env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        keep_trailing_newline=True,
    )
    page_template = jinja_env.get_template("page.md.j2")
    index_template = jinja_env.get_template("index.md.j2")

    generated: list[str] = []
    skipped: list[tuple[str, str]] = []

    by_dir = find_documented_markdown()
    index_nav_orders, page_nav_orders = load_existing_nav_orders()

    # Shallowest directories first for deterministic nav_order assignment.
    for src_dir in sorted(by_dir, key=lambda p: (len(p.parts), p)):
        entries = by_dir[src_dir]
        readme = next(((p, m) for p, m in entries if p.name == "README.md"), None)

        # No README.md with a drjekyll header: ignore (and log) any siblings.
        if readme is None:
            for path, _ in entries:
                rel = str(path.relative_to(REPO_ROOT))
                skipped.append((rel, "no README.md with drjekyll header"))
            continue

        readme_path, readme_meta = readme
        readme_title = readme_meta.get("title") or src_dir.name
        children = sorted((p, m) for p, m in entries if p.name != "README.md")

        dir_tuple = docs_parts(src_dir)
        depth = len(dir_tuple)
        slug = "-".join(dir_tuple)
        docs_dir_path = DOCS_DIR / Path(*dir_tuple)
        docs_dir_path.mkdir(parents=True, exist_ok=True)

        # ---- index page (from README) ----
        page_symlink = create_include_symlink(readme_path, f"{slug}.md")

        if dir_tuple not in index_nav_orders:
            parent_key = dir_tuple[:-1]
            sibling_indices = {
                k[-1]: v
                for k, v in index_nav_orders.items()
                if len(k) == depth and k[:-1] == parent_key
            }
            sibling_pages = dict(page_nav_orders.get(parent_key, {}))
            index_nav_orders[dir_tuple] = next_nav_order(
                {**sibling_indices, **sibling_pages}
            )

        index_content = index_template.render(
            index_name=readme_title,
            nav_order=index_nav_orders[dir_tuple],
            parent=readme_meta.get("parent"),
            grand_parent=readme_meta.get("grand_parent"),
            has_children="true" if children else "false",
            page_symlink=page_symlink,
        )
        index_path = docs_dir_path / "index.md"
        index_path.write_text(index_content, encoding="utf-8")
        generated.append(str(index_path.relative_to(REPO_ROOT)))

        # ---- child pages ----
        for child_path, child_meta in children:
            stem = child_path.stem

            if child_meta.get("parent"):
                parent_title = child_meta["parent"]
                grand_parent_title = child_meta.get("grand_parent")
            else:
                parent_title = readme_title
                grand_parent_title = readme_meta.get("parent")

            child_symlink = create_include_symlink(child_path, f"{slug}-{stem}.md")

            if stem not in page_nav_orders[dir_tuple]:
                sibling_indices = {
                    k[-1]: v
                    for k, v in index_nav_orders.items()
                    if len(k) == depth + 1 and k[:-1] == dir_tuple
                }
                sibling_pages = dict(page_nav_orders.get(dir_tuple, {}))
                page_nav_orders[dir_tuple][stem] = next_nav_order(
                    {**sibling_indices, **sibling_pages}
                )

            child_content = page_template.render(
                page_name=child_meta.get("title") or stem,
                nav_order=page_nav_orders[dir_tuple][stem],
                parent=parent_title,
                grand_parent=grand_parent_title,
                description=(child_meta.get("description") or "").strip(),
                page_symlink=child_symlink,
            )
            child_doc_path = docs_dir_path / f"{stem}.md"
            child_doc_path.write_text(child_content, encoding="utf-8")
            generated.append(str(child_doc_path.relative_to(REPO_ROOT)))

    # Summary
    print("# Documentation Generation Summary")
    print('\n---\n')

    print(f"\n## Generated ({len(generated)}):")
    for path in generated:
        print(f"  + `{path}`")

    if skipped:
        print(f"\n## Skipped ({len(skipped)}):")
        for path, reason in skipped:
            print(f"  - `{path}`  [{reason}]")

    print(f"\n---\n**Total: {len(generated)} generated, {len(skipped)} skipped**")


if __name__ == "__main__":
    main()
