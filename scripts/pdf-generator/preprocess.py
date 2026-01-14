#!/usr/bin/env python3
"""
Preprocess QuestDB Cookbook markdown files for PDF generation.

- Reads cookbook files in sidebar order
- Transforms questdb-sql demo blocks into code + clickable demo links
- Combines into single markdown with proper part/chapter/section structure
"""

import argparse
import re
import urllib.parse
from pathlib import Path
from collections import OrderedDict


def parse_sidebar_items(sidebars_content: str) -> list[str]:
    """Extract cookbook file paths from sidebars.js."""
    cookbook_pattern = r'"(cookbook/[^"]+)"'
    matches = re.findall(cookbook_pattern, sidebars_content)
    return matches


def extract_frontmatter(content: str) -> tuple[dict, str]:
    """Extract YAML frontmatter and return metadata dict + remaining content."""
    frontmatter = {}
    body = content

    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            fm_content = parts[1].strip()
            body = parts[2].strip()

            for line in fm_content.split('\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    frontmatter[key.strip()] = value.strip().strip('"\'')

    return frontmatter, body


def create_demo_link(sql: str) -> str:
    """Create a clickable demo.questdb.io link for SQL query."""
    encoded = urllib.parse.quote(sql.strip(), safe='')
    return f"https://demo.questdb.io/?query={encoded}&executeQuery=true"


def transform_code_blocks(content: str) -> str:
    """Transform questdb-sql demo blocks to include clickable links."""

    def replace_demo_block(match):
        title_part = match.group(1) or ""
        sql = match.group(2)

        title_match = re.search(r'title="([^"]+)"', title_part)
        title = title_match.group(1) if title_match else None

        header = f"**{title}**\n\n" if title else ""
        demo_link = create_demo_link(sql)

        return f'''{header}```sql
{sql.strip()}
```

[Run on demo.questdb.com]({demo_link})
'''

    pattern = r'```questdb-sql demo([^\n]*)\n(.*?)```'
    content = re.sub(pattern, replace_demo_block, content, flags=re.DOTALL)
    content = re.sub(r'```questdb-sql([^\n]*)\n', r'```sql\n', content)

    return content


def transform_admonitions(content: str) -> str:
    """Transform Docusaurus admonitions to PDF-friendly format. Remove info boxes with 'Related' in title."""

    def replace_admonition(match):
        adm_type = match.group(1)
        title = match.group(2) or adm_type.upper()
        body = match.group(3).strip()

        # Remove "Related Documentation" info boxes entirely
        if adm_type == 'info' and 'Related' in title:
            return ''

        labels = {
            'note': 'NOTE',
            'tip': 'TIP',
            'info': 'INFO',
            'warning': 'WARNING',
            'danger': 'DANGER',
        }
        label = labels.get(adm_type, adm_type.upper())

        return f'''> **{label}: {title}**
>
> {body.replace(chr(10), chr(10) + "> ")}
'''

    pattern = r':::(\w+)\s*([^\n]*)\n(.*?):::'
    return re.sub(pattern, replace_admonition, content, flags=re.DOTALL)


def remove_docusaurus_links(content: str) -> str:
    """Convert Docusaurus internal links to plain text."""
    content = re.sub(r'\[([^\]]+)\]\(/docs/[^)]+\)', r'\1', content)
    return content


def adjust_header_levels(content: str, level_increase: int) -> str:
    """Increase all header levels by specified amount."""
    def increase_level(match):
        hashes = match.group(1)
        text = match.group(2)
        new_hashes = '#' * min(len(hashes) + level_increase, 6)
        return f"{new_hashes} {text}"

    return re.sub(r'^(#{1,6})\s+(.+)$', increase_level, content, flags=re.MULTILINE)


def process_file(filepath: Path, header_level: int = 1) -> tuple[str, str]:
    """Process a single markdown file. Returns (title, processed_body)."""
    content = filepath.read_text(encoding='utf-8')
    frontmatter, body = extract_frontmatter(content)

    title = frontmatter.get('title', filepath.stem.replace('-', ' ').title())

    body = transform_code_blocks(body)
    body = transform_admonitions(body)
    body = remove_docusaurus_links(body)
    body = adjust_header_levels(body, header_level)

    return title, body


def format_category_name(name: str) -> str:
    """Format a category/subcategory name for display."""
    name_map = {
        'sql': 'SQL Recipes',
        'finance': 'Finance',
        'time-series': 'Time Series',
        'advanced': 'Advanced Queries',
        'operations': 'Operations',
        'integrations': 'Integrations',
        'programmatic': 'Programmatic Access',
        'grafana': 'Grafana',
        'opcua': 'OPC-UA',
        'php': 'PHP',
        'ruby': 'Ruby',
        'cpp': 'C++',
    }
    return name_map.get(name, name.replace('-', ' ').title())


def get_online_url(rel_path: str) -> str:
    """Generate the questdb.com URL for a cookbook page."""
    return f"https://questdb.com/docs/{rel_path}/"


def parse_path_structure(rel_path: str) -> tuple[str, str | None, str]:
    """Parse a path like cookbook/sql/finance/compound-interest into (category, subcategory, recipe)."""
    parts = rel_path.replace('cookbook/', '').split('/')

    if len(parts) == 1:
        # cookbook/index or cookbook/demo-data-schema
        return (None, None, parts[0])
    elif len(parts) == 2:
        # cookbook/operations/docker-compose-config
        return (parts[0], None, parts[1])
    elif len(parts) >= 3:
        # cookbook/sql/finance/compound-interest or cookbook/integrations/grafana/dynamic-table-queries
        return (parts[0], parts[1], parts[2])

    return (None, None, rel_path)


def main():
    parser = argparse.ArgumentParser(description='Preprocess cookbook for PDF')
    parser.add_argument('--cookbook-root', required=True, help='Path to cookbook directory')
    parser.add_argument('--sidebars', required=True, help='Path to sidebars.js')
    parser.add_argument('--output', required=True, help='Output markdown file')
    args = parser.parse_args()

    cookbook_root = Path(args.cookbook_root)
    sidebars_path = Path(args.sidebars)
    output_path = Path(args.output)

    sidebars_content = sidebars_path.read_text(encoding='utf-8')
    file_paths = parse_sidebar_items(sidebars_content)

    combined = []

    # Process intro page first
    intro_path = cookbook_root / "index.md"
    if intro_path.exists():
        print("Processing: Introduction")
        title, body = process_file(intro_path, header_level=1)
        combined.append(f"# Introduction\n\n{body}\n\n\\newpage\n\n")

    # Group files by category and subcategory
    structure = OrderedDict()
    for rel_path in file_paths:
        if rel_path in ('cookbook/index', 'cookbook/demo-data-schema'):
            continue

        category, subcategory, recipe = parse_path_structure(rel_path)
        if category is None:
            continue

        if category not in structure:
            structure[category] = OrderedDict()

        if subcategory:
            if subcategory not in structure[category]:
                structure[category][subcategory] = []
            structure[category][subcategory].append(rel_path)
        else:
            if '_root' not in structure[category]:
                structure[category]['_root'] = []
            structure[category]['_root'].append(rel_path)

    # Generate content with proper hierarchy
    for category, subcategories in structure.items():
        category_name = format_category_name(category)
        combined.append(f"\\sectionpage{{{category_name}}}\n\n")
        print(f"\nPart: {category_name}")

        for subcategory, recipes in subcategories.items():
            if subcategory == '_root':
                # Recipes directly under category (no subcategory)
                for rel_path in recipes:
                    filepath = cookbook_root.parent / f"{rel_path}.md"
                    if not filepath.exists():
                        print(f"  Warning: File not found: {filepath}")
                        continue

                    title, body = process_file(filepath, header_level=1)
                    online_url = get_online_url(rel_path)
                    print(f"  Chapter: {title}")
                    combined.append(f"# {title}\n\n{body}\n\n[View this recipe online]({online_url})\n\n\\newpage\n\n")
            else:
                # Subcategory as chapter
                subcategory_name = format_category_name(subcategory)
                combined.append(f"# {subcategory_name}\n\n")
                print(f"  Chapter: {subcategory_name}")

                for rel_path in recipes:
                    filepath = cookbook_root.parent / f"{rel_path}.md"
                    if not filepath.exists():
                        print(f"    Warning: File not found: {filepath}")
                        continue

                    title, body = process_file(filepath, header_level=2)
                    online_url = get_online_url(rel_path)
                    print(f"    Section: {title}")
                    combined.append(f"\\newpage\n\n## {title}\n\n{body}\n\n[View this recipe online]({online_url})\n\n")

                combined.append("\\newpage\n\n")

    # Add demo data schema as appendix
    demo_schema_path = cookbook_root / "demo-data-schema.md"
    if demo_schema_path.exists():
        print("\nAppendix: Demo Data Schema")
        title, body = process_file(demo_schema_path, header_level=1)
        online_url = get_online_url("cookbook/demo-data-schema")
        combined.append(f"\\sectionpage{{Appendix}}\n\n# Demo Data Schema\n\n{body}\n\n[See the schema page online]({online_url})\n\n")

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text('\n'.join(combined), encoding='utf-8')
    print(f"\nGenerated {output_path}")


if __name__ == '__main__':
    main()
