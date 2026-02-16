#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATAGRID_SRC="$HOME/src/shared/ui-components/datagrid-extended/src/lib"
VENDOR_DIR="$SCRIPT_DIR/.datagrid-extended-src"

# Vendor datagrid-extended source (excluding tests)
echo "Vendoring datagrid-extended source..."
rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR"
rsync -a --exclude='__tests__' "$DATAGRID_SRC/" "$VENDOR_DIR/"
echo "  Copied $(find "$VENDOR_DIR" -type f | wc -l | tr -d ' ') files"

# Deploy
echo "Deploying to Fly.io..."
cd "$SCRIPT_DIR"
fly deploy --remote-only

# Clean up vendored source
rm -rf "$VENDOR_DIR"
echo "Deploy complete."
