#!/bin/bash
#
# Generate QuestDB Whitepaper PDF from markdown
#
# Usage:
#   ./generate-pdf.sh                              # builds executive whitepaper
#   ./generate-pdf.sh technical-whitepaper.md       # builds any whitepaper
#   ./generate-pdf.sh my-doc.md /path/to/logo.png   # with custom logo
#
# Requirements:
#   - Pandoc (brew install pandoc)
#   - XeLaTeX (brew install --cask mactex or basictex)
#   - Fonts: Helvetica Neue, Menlo (included with macOS)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/output"
PDF_OUTPUT_DIR="$SCRIPT_DIR/test-output"
TEMPLATE="$SCRIPT_DIR/template.tex"

# Input markdown (default: executive whitepaper)
INPUT="${1:-$SOURCE_DIR/executive-whitepaper.md}"
INPUT_BASENAME="$(basename "$INPUT" .md)"

# Logo (default: QuestDB full logo converted to PDF for XeLaTeX)
DEFAULT_LOGO="$SCRIPT_DIR/questdb-logo.pdf"
LOGO="${2:-$DEFAULT_LOGO}"

# Output PDF (test builds only; baseline PDFs live in output/)
OUTPUT_PDF="$PDF_OUTPUT_DIR/${INPUT_BASENAME}.pdf"

echo "=== QuestDB Whitepaper PDF Generator ==="
echo "Input:    $INPUT"
echo "Template: $TEMPLATE"
echo "Logo:     $LOGO"
echo "Output:   $OUTPUT_PDF"
echo ""

# Validate inputs
if [ ! -f "$INPUT" ]; then
    echo "Error: Input file not found: $INPUT"
    exit 1
fi

if [ ! -f "$TEMPLATE" ]; then
    echo "Error: Template not found: $TEMPLATE"
    exit 1
fi

# Check logo exists; if not, pandoc will use text fallback
LOGO_ARG=""
if [ -f "$LOGO" ]; then
    LOGO_ARG="--variable=logo:$LOGO"
    echo "Using logo: $LOGO"
else
    echo "Logo not found, using text fallback"
fi

# QR code for title page - pick based on which whitepaper is being built
if echo "$INPUT_BASENAME" | grep -q "technical"; then
    QRCODE="$SCRIPT_DIR/qr-docs.png"
else
    QRCODE="$SCRIPT_DIR/qr-enterprise-contact.png"
fi
QRCODE_ARG=""
if [ -f "$QRCODE" ]; then
    QRCODE_ARG="--variable=qrcode:$QRCODE"
    echo "Using QR:   $QRCODE"
else
    echo "QR code not found, skipping"
fi

# Create output directory
mkdir -p "$PDF_OUTPUT_DIR"

# Generate PDF
echo "Generating PDF..."
pandoc "$INPUT" \
    -o "$OUTPUT_PDF" \
    --pdf-engine=xelatex \
    --template="$TEMPLATE" \
    --resource-path="$SCRIPT_DIR:$SOURCE_DIR" \
    --lua-filter="$SCRIPT_DIR/style-tables.lua" \
    --lua-filter="$SCRIPT_DIR/keep-headings-with-tables.lua" \
    --lua-filter="$SCRIPT_DIR/autolink-bare-urls.lua" \
    --syntax-definition="$SCRIPT_DIR/questdb-sql.xml" \
    --top-level-division=chapter \
    --toc \
    --toc-depth=3 \
    --highlight-style=tango \
    $LOGO_ARG \
    $QRCODE_ARG \
    --variable=fontdir:"$SCRIPT_DIR/fonts" \
    --variable=coverbg:"$SCRIPT_DIR/cover-background.png" \
    --variable=coverlogo:"$SCRIPT_DIR/quest-db-logo-light.png" \
    --variable=colorlinks:true

echo ""
echo "=== Done ==="
echo "PDF generated: $OUTPUT_PDF"
