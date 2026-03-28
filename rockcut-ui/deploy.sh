#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Shared library sources
DATAGRID_SRC="$HOME/src/shared/ui-components/datagrid-extended/src/lib"
GANTT_SRC="$HOME/src/shared/ui-components/gantt-widget/src"
WORKFLOW_SRC="$HOME/src/shared/wf/ui/src"

# Vendor directories (copied into Docker context)
DATAGRID_VENDOR="$SCRIPT_DIR/.datagrid-extended-src"
GANTT_VENDOR="$SCRIPT_DIR/.gantt-widget-src"
WORKFLOW_VENDOR="$SCRIPT_DIR/.workflow-editor-src"

# Vendor datagrid-extended source (excluding tests)
echo "Vendoring datagrid-extended source..."
rm -rf "$DATAGRID_VENDOR"
mkdir -p "$DATAGRID_VENDOR"
rsync -a --exclude='__tests__' "$DATAGRID_SRC/" "$DATAGRID_VENDOR/"
echo "  Copied $(find "$DATAGRID_VENDOR" -type f | wc -l | tr -d ' ') files"

# Vendor gantt-widget source (excluding tests)
echo "Vendoring gantt-widget source..."
rm -rf "$GANTT_VENDOR"
mkdir -p "$GANTT_VENDOR"
rsync -a --exclude='__tests__' --exclude='*.test.*' --exclude='*.spec.*' "$GANTT_SRC/" "$GANTT_VENDOR/"
echo "  Copied $(find "$GANTT_VENDOR" -type f | wc -l | tr -d ' ') files"

# Vendor workflow-editor source (excluding tests and docs)
echo "Vendoring workflow-editor source..."
rm -rf "$WORKFLOW_VENDOR"
mkdir -p "$WORKFLOW_VENDOR"
rsync -a --exclude='__tests__' --exclude='*.test.*' --exclude='*.spec.*' --exclude='docs/' "$WORKFLOW_SRC/" "$WORKFLOW_VENDOR/"
echo "  Copied $(find "$WORKFLOW_VENDOR" -type f | wc -l | tr -d ' ') files"

# Deploy
echo "Deploying to Fly.io..."
cd "$SCRIPT_DIR"
fly deploy --remote-only

# Clean up vendored source
rm -rf "$DATAGRID_VENDOR" "$GANTT_VENDOR" "$WORKFLOW_VENDOR"
echo "Deploy complete."
