#!/bin/bash
#
# Regenerate all whitepaper PDFs into test-output/ for visual review.
#
# Usage:
#   ./regenerate-test-output.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_OUTPUT="$SCRIPT_DIR/test-output"

mkdir -p "$TEST_OUTPUT"

for name in executive technical comparison; do
  input="$SCRIPT_DIR/output/${name}-whitepaper.md"
  echo ""
  echo "=== Building ${name}-whitepaper ==="
  "$SCRIPT_DIR/generate-pdf.sh" "$input"
done

echo ""
echo "=== Done ==="
echo "Test PDFs written to: $TEST_OUTPUT"
