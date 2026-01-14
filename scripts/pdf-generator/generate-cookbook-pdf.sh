#!/bin/bash
#
# Generate QuestDB Cookbook PDF
# Usage: ./generate-cookbook-pdf.sh [cookbook_root] [output_dir]
#
# Requirements:
#   - Python 3
#   - Pandoc (brew install pandoc)
#   - LaTeX (brew install --cask mactex or basictex)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COOKBOOK_ROOT="${1:-$(dirname "$(dirname "$SCRIPT_DIR")")/documentation/cookbook}"
OUTPUT_DIR="${2:-$SCRIPT_DIR/output}"

echo "=== QuestDB Cookbook PDF Generator ==="
echo "Cookbook root: $COOKBOOK_ROOT"
echo "Output dir: $OUTPUT_DIR"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Step 1: Preprocess markdown files
echo "Step 1: Preprocessing markdown files..."
python3 "$SCRIPT_DIR/preprocess.py" \
    --cookbook-root "$COOKBOOK_ROOT" \
    --sidebars "$(dirname "$COOKBOOK_ROOT")/sidebars.js" \
    --output "$OUTPUT_DIR/cookbook-combined.md"

# Step 2: Generate PDF with Pandoc
echo "Step 2: Generating PDF..."
pandoc "$OUTPUT_DIR/cookbook-combined.md" \
    -o "$OUTPUT_DIR/questdb-cookbook.pdf" \
    --pdf-engine=xelatex \
    --template="$SCRIPT_DIR/template.tex" \
    --toc \
    --toc-depth=3 \
    --highlight-style=tango \
    --variable=colorlinks:true \
    --variable=linkcolor:blue \
    --variable=urlcolor:blue \
    --metadata title="QuestDB Cookbook" \
    --metadata subtitle="SQL Recipes for Time-Series Data" \
    --metadata date="$(date '+%B %Y')"

echo ""
echo "=== Done ==="
echo "PDF generated: $OUTPUT_DIR/questdb-cookbook.pdf"
echo "Combined markdown: $OUTPUT_DIR/cookbook-combined.md"
